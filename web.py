import os
from flask import Flask, request, jsonify
from rdioapi import Rdio
from pprint import pprint

app = Flask(__name__)
api = None

@app.route('/')
def index():
  return open('index.html').read()

@app.route('/api/getUser')
def get_user():
  key = request.args.get('key')
  response = api.get(keys=key)
  return jsonify(response[key])

if __name__ == '__main__':
  print 'starting'
  port = int(os.environ.get('PORT', 5000))
  rdio_key = os.environ.get('RDIO_API_KEY')
  rdio_secret = os.environ.get('RDIO_API_SECRET')
  state = {}
  api = Rdio(rdio_key, rdio_secret, state)
  app.run(host='0.0.0.0', port=port)
