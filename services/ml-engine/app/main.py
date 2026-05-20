from flask import Flask, request, jsonify
import os
import numpy as np
import tempfile
try:
    from app.preprocessing.cleaner import parse_apple_health_xml  # gunicorn: app.main:app
except ModuleNotFoundError:
    from preprocessing.cleaner import parse_apple_health_xml       # python app/main.py

app = Flask(__name__)

@app.route('/')
def test():
    return ("TESTING ML-ENGINE")

@app.route('/process-xml', methods=['POST'])
def process_xml():
    # Capture the stream directly from the incoming multipart network request
    print(f"📥 Received upload request, content-length: {request.content_length}", flush=True)
    
    if 'file' not in request.files:
        print("❌ No 'file' key in request.files", flush=True)
        return jsonify({"error": "No file payload chunk found in request"}), 400
    if 'file' not in request.files:
        return jsonify({"error": "No file payload chunk found in request"}), 400
        
    uploaded_file = request.files['file']
    if uploaded_file.filename == '':
        return jsonify({"error": "Empty filename passed"}), 400

    # Write the stream to a tempfile isolated safely INSIDE this specific container
    with tempfile.NamedTemporaryFile(delete=False, suffix=".xml") as temp_file:
        uploaded_file.save(temp_file.name)
        local_temp_path = temp_file.name

    try:
        # Hand off the local container path directly to your clean engine
        cleaned_records = parse_apple_health_xml(local_temp_path)
        
        # Wipe the file inside this container immediately to free up memory footprint
        if os.path.exists(local_temp_path):
            os.remove(local_temp_path)
        
        # Format the data for JSON (convert Timestamps to strings)
        for record in cleaned_records:
            if hasattr(record['startDate'], 'isoformat'):
                record['startDate'] = record['startDate'].isoformat()
            if hasattr(record['endDate'], 'isoformat'):
                record['endDate'] = record['endDate'].isoformat()
            
            # Handle Python NaN/Inf values which crash JSON
            if isinstance(record['value'], float) and (np.isnan(record['value']) or np.isinf(record['value'])):
                record['value'] = 0

        return jsonify(cleaned_records), 200

    except Exception as e:
        # Emergency exception cleanup loop to catch runtime file leakage
        if os.path.exists(local_temp_path):
            os.remove(local_temp_path)
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port, debug=False)
