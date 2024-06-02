from flask import Flask, request, jsonify, render_template
import openai
import logging
import os
import sys
import base64
import io
import json
#import traceback

app = Flask(__name__)

# TODO: use sessions
thread = None
reloadDataset = True

# Configure logging
#logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
#logger = logging.getLogger(__name__)
#logging.basicConfig(filename='main.log', level=logging.INFO)
#logger.info('Started')

# Initialize OpenAI client
IsTal = False

HAGAI_ApiKey = "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"
HAGAI_ASST = "asst_kgpwc7dVBODphcB487klnaKe"
HAGAI_ASST_SYNC = "asst_jCqqj30IHlSfYxM01EouD5of" #"asst_IkhVWEN8vZkEWimCfdW6eSx6"
TAL_ApiKey = "sk-proj-BFbKzzb27bFbEndEZ5vET3BlbkFJGxqw2dRntSfYeF8CeTr3"
TAL_ASST = "asst_nLbdMNrnyGDFrIiSEqzoyTzj"

ApiKey = TAL_ApiKey if IsTal else HAGAI_ApiKey
#AsstId = TAL_ASST if IsTal else HAGAI_ASST
AsstId = HAGAI_ASST_SYNC

client = openai.OpenAI(
    api_key = ApiKey
)

# Retrieve the assistant
assistant_id = AsstId
assistant = client.beta.assistants.retrieve(assistant_id=assistant_id)

# openai EventHandler
class EventHandler(openai.AssistantEventHandler):
    def __init__(self):
        self.output = []
        super().__init__()

    #def on_text_created(self, text) -> None:
        #self.output.append("\nassistant > ")

    def on_text_delta(self, delta, snapshot):
        self.output.append(delta.value)

    def on_tool_call_created(self, tool_call):
        self.output.append(f"\nassistant > {tool_call.type}\n")

    def on_tool_call_delta(self, delta, snapshot):
        if delta.type == 'code_interpreter':
            self.output.append(delta.code_interpreter.input)
            self.output.append("\n\noutput >")
            for output in delta.code_interpreter.outputs:
                if output.type == "logs":
                    self.output.append(f"\n{output.logs}")
# /index
@app.route('/')
def index():

    global thread
    global reloadDataset

    reloadDataset = True
    
    # Create a Thread
    try:

        thread = client.beta.threads.create()
        initParamsJson()
        
    except Exception as e:
            
        logging.error(f"Error during request processing: {str(e)}")
        return jsonify({"error": str(e)}), 500

    # render page
    return render_template('index.html')

def initParamsJson():
    file_path = os.path.join(os.path.dirname(__file__), 'params.json')
    empty_array_text = '[]'
    
    with open(file_path, 'w') as file:
        file.write(empty_array_text)
    

# /ask
@app.route('/ask', methods=['POST'])
def ask():

    global reloadDataset

    log = "ask\n"
    log = log + f"\nthread.id: {thread.id} ; assistant.id: {assistant.id} "
    #logger.info('ask')
    #logger.info(f"thread.id: {thread.id} ; assistant.id: {assistant.id} ")


    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No data'}), 400

    # handle request input params
    user_input      = data['message'].strip()
    hasFile         = 'file' in data
    file_data       = data['file'] if hasFile else None
    filename        = data['filename'] if hasFile else ''
    #hasParams       = 'params' in data

     # handle attached file
    
    if hasFile:
        # Decode the base64 string
        file_bytes = base64.b64decode(file_data)

        # Convert the bytes to a file-like object
        file_like_object = io.BytesIO(file_bytes)
        file_like_object.name = filename  # Ensure the file-like object has the filename with extension

        # Upload the file to OpenAI for use with an assistant or thread
        file_upload_response = client.files.create(
            file=file_like_object,  # Use the file-like object directly
            purpose="assistants"
        )
        file_id = file_upload_response.id

        # creating a vector store and adding this file
        vector_store = client.beta.vector_stores.create(name="User Vector Store2")

        client.beta.vector_stores.file_batches.upload_and_poll(
            vector_store_id=vector_store.id,
            files=[file_like_object]
        )

   
    #try:

    #logger.info('try')
    log = log + f"\ntry "

    # prepare payload
    dataset = {}

    if reloadDataset:
        # dataSet
        dataset = loadDataSet()
        reloadDataset = False
        #content = "{'content': " + user_input + ", 'dataset':" + json.dumps(dataset) + "}"
    #else:
    # params
    params = loadParams()
    #content = "{'content': " + user_input + ", 'params': " + json.dumps(params) + "}"

    content = '{"content": "' + user_input + '", "params": ' + json.dumps(params) + ', "dataset":' + json.dumps(dataset) + '}'
    print ("CONTENT: " + content)    

    # Add a Message to the Thread
    if hasFile: # with a file attachment
        client.beta.threads.messages.create(
            thread_id=thread.id,
            role="user",
            content=content,
            attachments= [
                { "file_id": file_id, "tools": [{"type": "file_search"}] }
            ]
        )
    else:       # without a file attachment
        client.beta.threads.messages.create(
            thread_id=thread.id,
            role="user",
            content=content
        )
            

    # Create and Stream a Run
    #logger.info('Create and Stream a Run')
    log = log + f"\nCreate and Stream a Run "


    event_handler = EventHandler()
    with client.beta.threads.runs.stream(
        thread_id=thread.id,
        assistant_id=assistant.id,
        instructions="",
        event_handler=event_handler
    ) as stream:
        stream.until_done()

    #####################################################
    ##  RESPONSE
    #####################################################
        
    output = ''.join(event_handler.output)  # join all streams into a single text
    print ("AI: " + output)    

    data = json.loads(output)

    reply = data['reply']

        


    # update params from ai (update json)
    params = []
        
    if 'params' in data:
        params = data['params']
        upsertParams(params)

            
    #logger.info('reply')
    log = log + "\nreply "

    #return jsonify({'reply': reply + "\n" + log})
    return jsonify({'reply': reply, 'params': params})
    
    #except Exception as e:
    #    log = log + f"\nError during request processing: {str(e)}"
    #    return jsonify({"error": str(e) + "\n" + log})#, 500

# update_nested_dict
def update_nested_dict(d, key, value):
    """
    Update a nested dictionary.
    
    :param d: The dictionary to update
    :param key: A dotted string representing the path to the target value
    :param value: The value to set at the specified path
    """
    keys = key.split(".")
    for k in keys[:-1]:
        d = d.setdefault(k, {})
    d[keys[-1]] = value

# upsertParams
def upsertParams(params):
    try:
        
        # Read the existing JSON file
        dataset = loadDataSet()

        # Update the data based on the params
        for key, value in params.items():
            update_nested_dict(dataset, key, value)

        # Write the updated data back to the JSON file
        with open("dataset.json", "w") as jsonFile:
            json.dump(data, jsonFile, indent=4)
            
    except Exception as e:
        # TODO
        return jsonify({"error": str(e)})#, 500

# loadParams
def loadParams():
    try:

        with open("params.json", mode="r", encoding="utf-8") as jsonFile:
            params = json.load(jsonFile)

        return params
        
    except Exception as e:
            
        logging.error(f"loadParams Error: {str(e)}")
        return jsonify({"error": str(e)})#, 500
    

# /getDataSet
@app.route('/getDataSet', methods=['POST'])
def getDataSet():

    dataset = loadDataSet()

    return jsonify({'dataset': dataset})


# loadDataSet
def loadDataSet():
    try:
        with open("dataset.json", mode="r", encoding="utf-8") as jsonFile:
            dataset = json.load(jsonFile)

        return dataset

    except Exception as e:
            
        logging.error(f"loadDataSet Error: {str(e)}")
        return jsonify({"error": str(e)})#, 500



# /setParams
@app.route('/setParams', methods=['POST'])
def setParams():

    data = request.get_json()
    
    if not data or not 'params' in data:
        return jsonify({'error': 'No data'}), 400

    newParams = data['params']
    print ("setParams: " + json.dumps(newParams))    



    try:

        # 1. update params
        
        # Read the existing JSON file
        with open("params.json", mode="r", encoding="utf-8") as jsonFile:
            params = json.load(jsonFile)

        # append new params to old ones
        allParams = params + newParams

        # Write back to the JSON file
        with open("params.json", "w") as jsonFile:
            json.dump(allParams, jsonFile, indent=4)

        # 2. update dataset
        upsertParams(params)
            
    except Exception as e:
            
        logging.error(f"Error during request processing: {str(e)}")
        return jsonify({"error": str(e)})#, 500

    return jsonify({'status': 'success'})


    
    

if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=8080, use_reloader=False)


    
