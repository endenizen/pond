import os
from flask import Flask, request, jsonify
from rdioapi import Rdio
from pprint import pprint

app = Flask(__name__)
rdio_key = os.environ.get('RDIO_API_KEY')
rdio_secret = os.environ.get('RDIO_API_SECRET')
state = {}
api = Rdio(rdio_key, rdio_secret, state)

@app.route('/')
def index():
  return open('index.html').read()

@app.route('/api/get_user')
def get_user():
  vanity_name = request.args.get('username')
  user = api.call('findUser', vanityName=vanity_name, extras='-*,key,firstName,lastName,lastSongPlayed,lastSongPlayTime,icon')

  friends = []

  if user:
    # get up to 300 friends
    friends = api.call('userFollowing', user=user['key'], count=300, extras='-*,key')

  response = {
    'user': user,
    'friends': friends
  }
  return jsonify(response)

@app.route('/api/get')
def get():
  keys = request.args.get('keys')
  extras = request.args.get('extras')
  response = api.get(keys=keys, extras=extras)
  return jsonify(response)

if __name__ == '__main__':
  port = int(os.environ.get('PORT', 5000))
  app.debug = True
  app.run(host='0.0.0.0', port=port)
