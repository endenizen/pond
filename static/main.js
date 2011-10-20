function App() {
  this.users = {};
  this.userArray = [];
  this.albums = {};
  this.albumArray = [];

  // users that aren't loaded into the app yet
  this.userQueue = [];
  this.albumQueue = [];

  this.data = {
    nodes: [],
    links: []
  };

  this.nodeLookup = {};
  this.linkLookup = {};
  this.appDiv = $('#app');
  this.chartDiv = null;

  this.expandTime = 100;

  this.vis = null;

  this.width = 100;
  this.height = 100;

  this.MAX_TIME = 120;

  // 0 minutes ago means link has distance 20
  // 120 minutes ago means link has distance 100
  this.distanceScale = d3.scale.linear()
    .domain([0, 120])
    .range([20, 100]);
}

App.prototype.log = function() {
  if(console && console.log) {
    console.log.apply(console, arguments);
  }
};

App.prototype.api = function(method, data, callback) {
  var self = this,
    url = 'api/' + method;

  $.ajax(url, {
    dataType: 'json',
    data: data,
    error: function() {
      self.log('error calling ' + method);
    },
    success: callback
  });
};

App.prototype.ingestUser = function(user) {
  var self = this,
    key = user.key;

  if(!self.users[key]) {
    // add new user to userhash
    self.users[key] = {
      history: {}
    };
    // add new user to userarray
    self.userArray.push(self.users[key]);
  }

  // update general user fields
  self.users[key].key = user.key;
  self.users[key].firstName = user.firstName;
  self.users[key].lastName = user.lastName;
  self.users[key].icon = user.icon;

  // get last song played
  var lastSong = user.lastSongPlayed;
  if(lastSong && 'albumKey' in lastSong && user.lastSongPlayTime) {
    var albumKey = lastSong.albumKey;
    // add to user's history
    self.users[key].history[albumKey] = Date.parse(user.lastSongPlayTime);

    if(!(albumKey in self.albums)) {
      self.albumQueue.push(albumKey);
    }
  }
};

App.prototype.getUsers = function(userKeys, callback) {
  var self = this;

  self.api('get', {keys: userKeys, extras: '-*,key,firstName,lastName,lastSongPlayed,lastSongPlayTime,icon'}, function(result) {
    var key;

    for(key in result) {
      self.ingestUser(result[key]);
    }

    callback();
  });
};

// get album specificed by albumKey, then call callback
App.prototype.getAlbums = function(albumKeys, callback) {
  var self = this;

  self.api('get', {keys: albumKeys, extras: '-*,key,name,artist,url,icon'}, function(result) {
    var albumKey, album;
    for(albumKey in result) {
      album = result[albumKey];
      self.albums[albumKey] = album;
      self.albumArray.push(self.albums[albumKey]);
    }
    callback();
  });
};

// currently only connects source == user to target == album
App.prototype.connect = function(sourceKey, targetKey, value) {
  var self = this,
    updated = false,
    linkHash,
    time, distance,
    source = self.nodeLookup[sourceKey],
    target = self.nodeLookup[targetKey];

  // one of source or target was not added to the graph yet, we will try again later
  if(typeof source === 'undefined' || typeof target === 'undefined') {
    return updated;
  }

  linkHash = source + ':' + target;

  // if we already have this link, ignore it
  if(typeof self.linkLookup[linkHash] !== 'undefined') {
    return updated;
  }

  // if this link is already expired, ignore it
  time = self.calculateTime(sourceKey, targetKey);
  if(time > self.MAX_TIME) {
    return updated;
  }

  // calculate initial distance for new link
  distance = self.calculateDistance(time);

  self.log('link for ' + source + ' to ' + target + ' (' + sourceKey + ' to ' + targetKey + ') didnt exist. creating.');

  self.data.links.push({
    source: source,
    target: target,
    value: value,
    distance: distance
  });
  self.linkLookup[linkHash] = true;
  updated = true;

  // did we update?
  return updated;
};

App.prototype.disconnect = function(i) {
  // i is the index of the link in the array self.data.links
  var self = this,
    linkHash,
    link = self.data.links[i];

  // link didn't exist? how are we here?
  if(typeof link === 'undefined') {
    return;
  }

  self.log('disconnecting link ' + i + ' which connected ' + link.source.key + ' to ' + link.target.key);

  // remove the lookup from linkLookup
  linkHash = link.source.index + ':' + link.target.index;
  delete self.linkLookup[linkHash];

  // remove this link from the array
  self.data.links.splice(i, 1);
};

App.prototype.updateGraph = function(forceDraw) {
  var self = this,
    i, j, nodeIndex, updated = forceDraw || false,
    time, distance, toRemove;

  self.log('updating graph');

  // TODO there's probably a better way to do this?
  self.curDate = Date.parse(new Date());

  // starting index for next node insertion
  nodeIndex = self.data.nodes.length;

  // have nodes, want to leave the same
  // have users, some of them are here already

  // remove old links
  toRemove = [];
  i = self.data.links.length;
  while(i--) {
    if(!self.data.links[i] || !self.data.links[i].source || !self.data.links[i].target) {
      continue;
    }
    time = self.calculateTime(self.data.links[i].source.key, self.data.links[i].target.key);
    if(time < 0) {
      time = 0;
    }
    if(time > self.MAX_TIME) {
      // expired link
      self.disconnect(i);
    } else {
      // set distance for this link
      self.data.links[i].distance = self.calculateDistance(time);
    }
  }

  // step through each user, see if they are in the list of nodes already
  // if they are in the nodeLookup, we assume they have a node already
  self.log('starting userArray iteration');
  for(i = 0; i < self.userArray.length; i++) {
    var key = self.userArray[i].key;
    if(!(key in self.nodeLookup)) {
      self.log('nodelookup didnt have ' + key + '. adding it to nodes');
      self.nodeLookup[key] = nodeIndex++;
      self.data.nodes.push({
        key: key,
        name: self.users[key].firstName + ' ' + self.users[key].lastName,
        group: 1,
        icon: self.users[key].icon
      });
      updated = true;
    }
  }

  for(i = 0; i < self.albumArray.length; i++) {
    var key = self.albumArray[i].key;
    if(!(key in self.nodeLookup)) {
      self.log('nodelookup didnt have ' + key + '. adding it to nodes');
      self.nodeLookup[key] = nodeIndex++;
      self.data.nodes.push({
        key: key,
        name: self.albums[key].name + ' by ' + self.albums[key].artist,
        artist: self.albums[key].artist,
        group: 2,
        icon: self.albums[key].icon
      });
      updated = true;
    }
  }

  // we now have all the required nodes in the node data, now add the proper links
  for(i in self.users) {
    //for(j in self.users[i].friends) {
    //  self.connect(i, self.users[i].friends[j].key, 1);
    //}
    for(j in self.users[i].history) {
      updated = self.connect(i, j, 2) || updated;
    }
  }

  if(updated) {
    self.doVis();
  }
};

App.prototype.calculateDistance = function(minsAgo) {
  // minsAgo should be between 0 and 120
  // turn that into a distance between 20 and 60
  var self = this;
  return Math.round(self.distanceScale(minsAgo));
};

App.prototype.calculateTime = function(userKey, albumKey) {
  var self = this,
    timeAgo = self.curDate - self.users[userKey].history[albumKey],
    minsAgo = timeAgo / 1000 / 60 / 60;

  return minsAgo;
};

App.prototype.initVis = function() {
  var self = this;

  self.log('initializing vis');

  self.chartDiv = $('<div id="chart"></div>').appendTo(self.appDiv);

  self.vis = d3.select('#chart').append('svg:svg')
    .attr('width', self.width)
    .attr('height', self.height);

  self.vis.append('svg:g')
    .attr('class', 'links');

  self.force = d3.layout.force()
    .linkDistance(function(d) {
      return d.distance;
    })
    .charge(-75)
    .nodes([])
    .links([])
    .size([self.width, self.height]);

  self.force.on('tick', function() {
    self.vis.selectAll('line.link')
      .attr('x1', function(d) { return d.source.x; })
      .attr('y1', function(d) { return d.source.y; })
      .attr('x2', function(d) { return d.target.x; })
      .attr('y2', function(d) { return d.target.y; });

    self.vis.selectAll('g.node')
      .attr('transform', function(d) {
        return 'translate(' + d.x + ',' + d.y + ')';
      });
  });
};

App.prototype.doVis = function() {
  var self = this,
    fill = d3.scale.category20();

  self.log('drawing vis', self.data);

  self.force.nodes(self.data.nodes);
  self.force.links(self.data.links);
  self.force.start();

  var linkGroup = self.vis.select('g.links');

  var link = linkGroup.selectAll("line.link")
    .data(self.data.links);

  link.enter().insert("svg:line")
    .attr("class", "link")
    //.style("stroke-width", function(d) { return Math.sqrt(d.value); })
    .attr('r', 20)
    .attr("x1", function(d) { return d.source.x; })
    .attr("y1", function(d) { return d.source.y; })
    .attr("x2", function(d) { return d.target.x; })
    .attr("y2", function(d) { return d.target.y; });

  link.exit().remove();

  var node = self.vis.selectAll('g.node')
    .data(self.data.nodes);

  var group = node.enter().append('svg:g')
    .attr("class", "node")
    .attr("cx", function(d) { return d.x; })
    .attr("cy", function(d) { return d.y; })
    .attr("r", 10)
    .call(self.force.drag);

  //node.append('svg:circle')
  //  .attr('width', '10px')
  //  .attr('height', '10px');

  group.append('svg:image')
    .attr('class', 'circle')
    .attr('xlink:href', function(d) { return d.icon; })
    .attr('x', function(d) { return d.group == 1 ? '-10px' : '-5px';})
    .attr('y', function(d) { return d.group == 1 ? '-10px' : '-5px';})
    .attr('width', function(d) { return d.group == 1 ? '20px' : '10px';})
    .attr('height', function(d) { return d.group == 1 ? '20px' : '10px';});

  //group.append('svg:text')
  //  .attr('class', 'nodetext')
  //  .attr('dx', 12)
  //  .attr('dy', '.35em');
  //  .text(function(d) { return d.name; });
  
  group.append('svg:title')
    .text(function(d) { return d.name; });

  node.exit().remove();
};

App.prototype.nextExpand = function() {
  var self = this;

  self.log('Triggering next expand in ' + self.expandTime + 'ms');

  window.setTimeout(function() {
    self.expand();
  }, self.expandTime);
};

// pull data on more users
App.prototype.expand = function() {
  var self = this,
    keysToGet;

  if(self.albumQueue.length > 0) {
    keysToGet = self.albumQueue.splice(0, 50);
    self.log('Expand is shifting albums from the queue');
    self.getAlbums(keysToGet.join(','), function() {
      self.updateGraph();
      self.nextExpand();
    });
  } else if(self.userQueue.length > 0) {
    self.log('Expand is shifting a user from the queue');
    keysToGet = self.userQueue.splice(0, 50);
    self.getUsers(keysToGet.join(','), function() {
      self.updateGraph();
      self.nextExpand();
    });
  }

  self.log('Expand is done. Resting...');
};

// triggered when size is changed, need to refresh all elements that have a width/height
App.prototype.redraw = function() {
  var self = this;

  self.appDiv.width(self.width);
  self.appDiv.height(self.height);

  self.appDiv.find('#chart').width(self.width);
  self.appDiv.find('#chart').height(self.height);

  self.vis.attr('width', self.width);
  self.vis.attr('height', self.height);

  self.force.size([self.width, self.height]);

  self.force.resume();
};

App.prototype.updateUsers = function() {
  var self = this,
    newQueue = [],
    i;

  self.log('Updating users');

  for(i = 0; i < self.userArray.length; i++) {
    self.userQueue.push(self.userArray[i].key);
    self.nextExpand();
  }
};

App.prototype.init = function(username) {
  var self = this;

  // get user first in case user doesn't exist
  self.api('get_user', {username:username}, function(result) {
    var user, friends;

    if(!result.user) {
      // reset
      $('input#user').fadeIn();
      $('#info').fadeIn();
    } else {
      // add first user to user array
      self.ingestUser(result.user);

      friends = result.friends;
      for(var i = 0; i < friends.length; i++) {
        if(!self.users[friends[i].key]) {
          self.userQueue.push(friends[i].key);
        }
      }

      // setup resize handler
      $(window).resize(function() {
        self.width = $(window).width();
        self.height = $(window).height();

        self.redraw();
      });

      // initialize visualization
      self.initVis();

      // trigger resize to set height/width
      $(window).resize();

      // update data in graph
      self.updateGraph();

      // trigger first data get
      self.nextExpand();
    }
  });

  window.setInterval(function() {
    self.updateUsers();
    self.doVis();
  }, 30000);
};

var app;

$(document).ready(function() {
  app = new App();

  $('input#user').keypress(function(e) {
    if(e.which == 13) {
      $(this).fadeOut();
      $('#info').fadeOut();
      app.init($(this).val());
    }
  }).focus();
});
