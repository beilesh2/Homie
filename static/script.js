let changedNodes = [];
let changedNodesIds = [];

// sendAjax
async function sendAjax(dataToSend) {
    try 
    {

        //if (changedNodes.length > 0) 
        //    dataToSend.params = changedNodes;
        

        const response = await $.ajax({
            url: '/ask',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(dataToSend),
            success: function(response) {
                //console.log("Response: ", response);  // Log the response to debug

                // handle reply

                $('#chat-box').append("<br><div id='reply'><strong>הומי: </strong>");

                if (response.reply && typeof response.reply === 'string' && response.reply.trim() !== '') {
                    const reply = response.reply.replaceAll("\n", "<br>");
                    $('#chat-box').append('<div>' + reply + '</div>');
                } else {
                    if (response.error && typeof response.error === 'string' && response.error.trim() !== '') {
                        $('#chat-box').append('<div>DEV ERROR: ' + response.error + '</div>');
                    } else {
                        $('#chat-box').append('<div>Undefined or empty response</div>');
                    }
                }

                $('#chat-box').append("</div>");
                $('#chat-box').append("<br>");

                $('#user-input').scrollTop($('#user-input').prop("scrollHeight") - $('#user-input').height());

//debugger;                
                // update tree according to params
                if (response.params) 
                    upsertTree(response.params);
                
            },
            error: function (error, thrownError) {
                //console.log("Error:", error);

                var errorResponse = JSON.parse(error.responseText);
                var errorMessage = errorResponse.error.message;
                alert(errorMessage);

                $('#chat-box').append('<div>Error fetching response: ' + thrownError + '</div>');
            }
        });
        
    } 
    catch (error) 
    {
        ////debugger;
        
        $('#chat-box').append('<div>Un handled Error: ' + error.errorMessage + '</div>');

        //console.error(error.responseText);
    }
}

// upsertTree
function upsertTree(params) 
{
    // update or insert nodes based on the given parameters
    /*
    for (const [key, value] of Object.entries(params)) {
        upsertNode(key, value);
    }
*/

    for (const p of params) { 
        const path = p[0]
        const val = p[1]
        const action = p[2]
        upsertNode(path, val, action);
    }
}

// upsertNode
// update or insert nodes in the jstree based on a given path
function upsertNode(path, value, action) 
{
    var tree = $('#tree').jstree(true);
    var nodes = path.split('.');    // node names
    const key = nodes.pop();        // last element is the attribute name. e.g budget
    var currentNodeId = '#';        // root node
//debugger;
    // Iterate through each node in the path
    for (var i = 0; i < nodes.length; i++) {
        var nodeName = nodes[i];
        
        // Find if the current node has a child with the specified nodeName
        var existingNodeId = tree.get_node(currentNodeId).children.find(function(child) {
            return tree.get_node(child).li_attr["data-key"] === nodeName;
        });
        
        if (existingNodeId) {
            // If the node exists, update currentNodeId to the existing node's ID
            currentNodeId = existingNodeId;
        } else {
            if (action === 'c') {
                // If the node does not exist and action is 'create', create the node
                currentNodeId = tree.create_node(currentNodeId, { "text": nodeName });
            } else {
                // If the node does not exist and action is not 'create', log an error and return
                console.error('Node does not exist and action is not create');
                return;
            }
        }
    }

    if (action === 'u') {
        // update node
//debugger;
        const node = tree.get_node(currentNodeId)

        const attrName = "data-" + key

        // set node's attr
        node.li_attr[attrName] = value

        // refresh node
        refreshNode(node)

    }
}

function refreshNode(node)
{
    const tree = $('#tree').jstree(true);
    const key = node.li_attr["data-key"]
    const name = node.li_attr["data-name"]
    const budget = node.li_attr["data-budget"]
    const status = node.li_attr["data-status"]

    // text
    const text = name ? 
        `<span class="node-name">${name}</span> (<span class="node-budget">${budget}</span> ש"ח)
        <span class="edit-buttons"><button class="edit-btn"><i class="fa-regular fa-pen-to-square"></i></button></span>` 
        : key

    tree.rename_node(node.id, text);

    // color
    if (status)
        node.li_attr["class"] = getStatusClass(status)

    tree.redraw(true);

}

// readFileAsDataURL
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        var reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
// xXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX


// document ready
$(document).ready(function() {

    loadTreeAsync();

    // send-btn.click
    $('#send-btn').click(async function() {

        const userInput = $('#user-input').val().trim();
        const file      = $('#file-input')[0].files[0];

        var dataToSend  = { message: userInput };

        if (!userInput.trim() && !file)    
            return;

        // Append the user's message to the chat box with prefix
        $('#chat-box').append(`<div><strong>אני:</strong><br>${userInput}</div>`);

        // Clear the input field
        $('#user-input').val('');

        // TODO
        $('#file-input').val('');


        if (file) 
        {
            try {
                const fileData = await readFileAsDataURL(file);

                const base64String = fileData.replace(/^data:.+;base64,/, '');

                dataToSend.file = base64String;
                dataToSend.filename = file.name;
            } 
            catch (err) 
            {
                alert('Error reading file');
                //console.error(err);
                return;
            }
        }

        sendAjax(dataToSend);

    });

    $('#file-input').change(function() {
        if (this.files.length > 0) {
            $('#file-input-label')
                .addClass('selected') 
                .removeClass('fa-paperclip')
                .addClass('fa-check-circle'); 
        } else {
            $('#file-input-label')
                .removeClass('selected')
                .removeClass('fa-check-circle')
                .addClass('fa-paperclip'); 
        }
    });

    $('#user-input').keypress(function(e) {
        if (e.which == 13) { // Enter key pressed
            $('#send-btn').click(); // Trigger the button click
        }
    });

    $('#tree').on('click', '.edit-btn', function(e) {
        //e.stopPropagation(); // Prevent jstree from handling this click event
        var nodeId = $(this).closest('li')[0].id;
        var node = $('#tree').jstree().get_node(nodeId);
        editNode(node);
    });

    $('#tree').on('click', '.submit-btn', function(e) {
        //e.stopPropagation(); // Prevent jstree from handling this click event
        var $node = $(this).closest('li');
        submitEdit($node);
    });

    $('#submit-changes').click(function() {
        submitAllChanges();
    });

});

// loadTreeAsync
function loadTreeAsync()
{
    $.ajax({
        url: '/getDataSet',
        type: 'POST',
        contentType: 'application/json',
        success: function(data) {
            const dataset = data.dataset
            const treeData = parseJsonToTreeData(dataset);

            $('#tree').jstree({
                'core': {
                    'data': treeData,
                    'check_callback': true
                }/*,
                'plugins': ["contextmenu", "dnd", "search", "state", "types", "wholerow"]*/
            });
        },
        error: function(xhr, status, error) {
            console.error("Error loading JSON file:", error);
        }
    });
    
    
}

// parseJsonToTreeData
function parseJsonToTreeData(json, path = '') {
    var result = [];

    for (var key in json) {
        if (json.hasOwnProperty(key)) {
            var item = json[key];
            var currentPath = path ? `${path}.${key}` : key;
            var node = {
                "text": item.name ? `<span class="node-name">${item.name}</span> (<span class="node-budget">${item.budget}</span> ש"ח)
                    <span class="edit-buttons"><button class="edit-btn"><i class="fa-regular fa-pen-to-square"></i></button></span>` : key,
                "state": {
                    "opened": true
                },
                "li_attr": {
                    "class": item.status ? getStatusClass(item.status) : '',
                    "data-key": key,
                    "data-name": item.name || '',
                    "data-budget": item.budget || '',
                    "data-status": item.status || '',
                    "data-path": currentPath
                },
                "children": []
            };
            // Detect if there are child nodes
            for (var childKey in item) {
                if (item.hasOwnProperty(childKey) && typeof item[childKey] === 'object') {
                    node.children.push(parseJsonToTreeData({ [childKey]: item[childKey] }, currentPath)[0]);
                }
            }
            result.push(node);
        }
    }
    return result;
}

/*
function editNode(node) {
    var $node = $(`#${node.id}`);
    var currentName = node.original.li_attr['data-name'];
    var currentBudget = node.original.li_attr['data-budget'];

    $node.find('.node-name').replaceWith(`<input class="editable node-name-edit" type="text" value="${currentName}" />`);
    $node.find('.node-budget').replaceWith(`<input class="editable node-budget-edit" type="number" value="${currentBudget}" />`);

    // Stop event propagation to prevent jstree from handling the click
    $node.find('.node-name-edit').on('click', function(e) { e.stopPropagation(); });
    $node.find('.node-budget-edit').on('click', function(e) { e.stopPropagation(); });

    // Collect changes
    $node.find('.node-name-edit, .node-budget-edit').on('input', function() {
        var newName = $node.find('.node-name-edit').val();
        var newBudget = $node.find('.node-budget-edit').val();

        var currentName = node.original.li_attr['data-name'];
        var currentBudget = node.original.li_attr['data-budget'];
        var nodePath = node.original.li_attr['data-path'];

        if (newName !== currentName) {
            addEditedNode(`${nodePath}.name`, newName);
            node.original.li_attr['data-name'] = newName;
        }
        if (newBudget !== currentBudget) {
            addEditedNode(`${nodePath}.budget`, newBudget);
            node.original.li_attr['data-budget'] = newBudget;
        }
    });
}
*/
function editNode(node) {
    const nodeId = node.id
    var $node = $(`#${nodeId}`);
    var currentName = node.li_attr['data-name'];
    var currentBudget = node.li_attr['data-budget'];

    $node.find('.node-name').replaceWith(`<input class="editable node-name-edit" type="text" value="${currentName}" />`);
    $node.find('.node-budget').replaceWith(`<input class="editable node-budget-edit" type="number" value="${currentBudget}" />`);

    // Stop event propagation to prevent jstree from handling the click
    $node.find('.node-name-edit').on('click', function(e) { e.stopPropagation(); });
    $node.find('.node-budget-edit').on('click', function(e) { e.stopPropagation(); });

    // Collect changes
    $node.find('.node-name-edit, .node-budget-edit').on('input', function() {
        var newName = $node.find('.node-name-edit').val();
        var newBudget = $node.find('.node-budget-edit').val();

        var currentName = node.li_attr['data-name'];
        var currentBudget = node.li_attr['data-budget'];
        var nodePath = node.li_attr['data-path'];

        if (newName !== currentName) {
            addEditedNode(nodeId, `${nodePath}.name`, newName);
            node.li_attr['data-name'] = newName;
        }
        if (newBudget !== currentBudget) {
            addEditedNode(nodeId, `${nodePath}.budget`, newBudget);
            node.li_attr['data-budget'] = newBudget;
        }
    });
}

// addEditedNode
function addEditedNode(nodeId, path, value, action = 'u') {
    //changedNodes.push({ path, value, action });


    // Check if the path already exists in the array
    const existingNodeIndex = changedNodes.findIndex(node => node.path === path);
    
    if (existingNodeIndex > -1) {
        // update existing node
        changedNodes[existingNodeIndex].value = value;
        changedNodes[existingNodeIndex].action = action;
    } else {
        // add a new node

        // TODO: check if not a bug: should be an array, not an object: {} -> []
        changedNodes.push({ path, value, action });
        changedNodesIds.push(nodeId);
    }

}

// unEditNode
function unEditNode(node){
    refreshNode(node)
}

// getStatusClass
function getStatusClass(status) {
    switch (status) {
        case 'r':
            return 'jstree-red';
        case 'y':
            return 'jstree-yellow';
        case 'g':
            return 'jstree-green';
        default:
            return '';
    }
}

// submitAllChanges
function submitAllChanges() {
    
    // submit the changes to the server

    try 
    {
        $.ajax({
            url: '/setParams',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({params: changedNodes}),
            success: function(response) {
                for (const nodeId of changedNodesIds) { 
                    const tree = $('#tree').jstree(true);
                    const node = tree.get_node(nodeId)
                    unEditNode(node)
                }
                changedNodes = []
                changedNodesIds = []
            },
            error: function (error, thrownError) {
                //console.log("Error:", error);

                var errorResponse = JSON.parse(error.responseText);
                var errorMessage = errorResponse.error.message;
                alert(errorMessage);

                $('#chat-box').append('<div>setParams Error: ' + thrownError + '</div>');
            }
        });
        
    } 
    catch (error) 
    {
        $('#chat-box').append('<div>Un handled Error: ' + error.errorMessage + '</div>');
    }
}

