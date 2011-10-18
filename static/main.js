(function($) {
  function App() {
    this.users = {};
    this.userArray = [];
    this.albums = {};
    this.albumArray = [];
    this.didGetFriends = false;

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

  App.prototype.getFriends = function(userKey, callback) {
    var self = this;

    self.log('Calling getFriends with user ' + userKey);

    self.api('following', {user: userKey}, function(result) {
      result = result.friends;
      for(var i = 0; i < result.length; i++) {
        if(!self.users[result[i].key]) {
          self.userQueue.push(result[i].key);
        }
      }
      callback(result);
    });
  };

  App.prototype.getUsers = function(userKeys, callback) {
    var self = this;

    self.api('get', {keys: userKeys, extras: '-*,key,firstName,lastName,lastSongPlayed,lastSongPlayTime,icon'}, function(result) {
      var key,
        obj;

      for(key in result) {
        obj = result[key];
        if(!self.users[key]) {
          // add new user to userhash
          self.users[key] = {
            history: {}
          };
          // add new user to userarray
          self.userArray.push(self.users[key]);
        }

        // update general user fields
        self.users[key].key = obj.key;
        self.users[key].firstName = obj.firstName;
        self.users[key].lastName = obj.lastName;
        self.users[key].icon = obj.icon;

        // get last song played
        var lastSong = obj.lastSongPlayed;
        if(lastSong && 'albumKey' in lastSong && obj.lastSongPlayTime) {
          self.log('albums stuff');
          var albumKey = lastSong.albumKey;
          // add to user's history
          self.users[key].history[albumKey] = obj.lastSongPlayTime;

          if(!(albumKey in self.albums)) {
            self.log('adding ' + albumKey + ' to albumQueue');
            self.albumQueue.push(albumKey);
          }
        }
      }
      callback();
    });
  };
  
  // get album specificed by albumKey, then call callback
  App.prototype.getAlbums = function(albumKeys, callback) {
    var self = this;

    self.api('get', {keys: albumKeys}, function(result) {
      var albumKey, album;
      for(albumKey in result) {
        album = result[albumKey];
        self.albums[albumKey] = album;
        self.albumArray.push(self.albums[albumKey]);
      }
      callback();
    });
  };
  
  App.prototype.connect = function(sourceKey, targetKey, value) {
    var self = this;
    var source = self.nodeLookup[sourceKey];
    var target = self.nodeLookup[targetKey];

    if(source == undefined || target == undefined) {
      // haven't added these yet, keep going
      return;
    }

    // only add the links if we don't have them yet. check the linkLookup hash
    if(!self.linkLookup[source+':'+target]) {
      self.log('link for ' + source + ' to ' + target + ' (' + sourceKey + ' to ' + targetKey + ') didnt exist. creating.');
      self.data.links.push({
        source: source,
        target: target,
        value: value
      });
      self.linkLookup[source+':'+target] = true;
    }
  };

  App.prototype.makeData = function() {
    var self = this,
      i, j;

    // starting index for next node insertion
    var nodeIndex = self.data.nodes.length;

    // have nodes, want to leave the same
    // have users, some of them are here already

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
      }
    }

    for(i = 0; i < self.albumArray.length; i++) {
      var key = self.albumArray[i].key;
      if(!(key in self.nodeLookup)) {
        self.log('nodelookup didnt have ' + key + '. adding it to nodes');
        self.nodeLookup[key] = nodeIndex++;
        self.data.nodes.push({
          key: key,
          name: self.albums[key].name,
          artist: self.albums[key].artist,
          group: 2,
          icon: self.albums[key].icon
        });
      }
    }

    // we now have all the required nodes in the node data, now add the proper links
    for(i in self.users) {
      for(j in self.users[i].friends) {
        self.connect(i, self.users[i].friends[j].key, 1);
      }
      for(j in self.users[i].history) {
        self.connect(i, j, 2);
      }
    }
  };

  App.prototype.initVis = function() {
    var self = this;

    self.chartDiv = $('<div id="chart"></div>').appendTo(self.appDiv);

    self.vis = d3.select('#chart').append('svg:svg')
      .attr('width', self.width)
      .attr('height', self.height);

    self.makeData();

    self.force = d3.layout.force()
      .linkDistance(function(d) {
        return 20;
      })
      .charge(-120)
      .nodes([])
      .links([])
      .size([self.width, self.height]);

    self.force.on('tick', function() {
      self.vis.selectAll('line.link')
        .attr('x1', function(d) { return d.source.x; })
        .attr('y1', function(d) { return d.source.y; })
        .attr('x2', function(d) { return d.target.x; })
        .attr('y2', function(d) { return d.target.y; });

      //self.vis.selectAll('circle.node')
      //  .attr('cx', function(d) { return d.x; })
      //  .attr('cy', function(d) { return d.y; });
      self.vis.selectAll('g.node')
        .attr('transform', function(d) {
          return 'translate(' + d.x + ',' + d.y + ')';
        });
    });
  };

  App.prototype.doVis = function() {
    var self = this,
      fill = d3.scale.category20();

    self.makeData();

    self.log('drawing vis', self.data);

    self.force.nodes(self.data.nodes);
    self.force.links(self.data.links);
    self.force.start();

    var link = self.vis.selectAll("line.link")
        .data(self.data.links);

    link.enter().append("svg:line")
        .attr("class", "link")
        .style("stroke-width", function(d) { return Math.sqrt(d.value); })
        .attr("x1", function(d) { return d.source.x; })
        .attr("y1", function(d) { return d.source.y; })
        .attr("x2", function(d) { return d.target.x; })
        .attr("y2", function(d) { return d.target.y; });

    link.exit().remove();

    var node = self.vis.selectAll('g.node')
      .data(self.data.nodes);

    node.enter().append('svg:g')
      .attr("class", "node")
      .attr("cx", function(d) { return d.x; })
      .attr("cy", function(d) { return d.y; })
      .attr("r", 10)
      .call(self.force.drag);

    //node.append('svg:circle')
    //  .attr('width', '10px')
    //  .attr('height', '10px');

    node.append('svg:image')
      .attr('class', 'circle')
      .attr('xlink:href', function(d) { return d.icon; })
      .attr('x', function(d) { return d.group == 1 ? '-10px' : '-5px';})
      .attr('y', function(d) { return d.group == 1 ? '-10px' : '-5px';})
      .attr('width', function(d) { return d.group == 1 ? '20px' : '10px';})
      .attr('height', function(d) { return d.group == 1 ? '20px' : '10px';});

    node.append('svg:text')
      .attr('class', 'nodetext')
      .attr('dx', 12)
      .attr('dy', '.35em')
      .text();
      //.text(function(d) { return d.name; });
    
    node.append('svg:title')
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
      keysToGet = self.albumQueue.splice(0, 30);
      self.log('Expand is shifting albums from the queue');
      self.getAlbums(keysToGet.join(','), function() {
        self.doVis();
        self.nextExpand();
      });
    } else if(self.userQueue.length > 0) {
      self.log('Expand is shifting a user from the queue');
      keysToGet = self.userQueue.splice(0, 30);
      self.getUsers(keysToGet.join(','), function() {
        self.doVis();
        self.nextExpand();
      });
    } else if(!self.didGetFriends) {
      self.didGetFriends = true;
      self.log('Expand has no users to shift, looking for new user.');
      // step through user array and find a user that doesn't have friends imported yet
      var newUser = null;
      for(var i = 0; i < self.userArray.length; i++) {
        if(!self.userArray[i].friends) {
          newUser = self.userArray[i];
          break;
        }
      }
      if(newUser) {
        self.log(newUser);
        self.getFriends(newUser.key, function(friends) {
          self.users[newUser.key].friends = friends;
          self.nextExpand();
        });
      } else {
        self.nextExpand();
      }
    }
    
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

  App.prototype.init = function(userKey) {
    var self = this;

    // get user first in case user doesn't exist
    self.getUsers(userKey, function() {
      var user = self.users[userKey];
      if(!user) {
        // reset
        $('input#user').fadeIn();
        $('#info').fadeIn();
      } else {
        $(window).resize(function() {
          self.width = $(window).width();
          self.height = $(window).height();

          self.redraw();
        });

        self.initVis();
        $(window).resize();
        self.doVis();
        self.nextExpand();
      }
    });

    window.setInterval(function() {
      self.updateUsers();
    }, 30000);
  };

  $(document).ready(function() {
    var app = new App();

    $('input#user').keypress(function(e) {
      if(e.which == 13) {
        $(this).fadeOut();
        $('#info').fadeOut();
        app.init($(this).val());
      }
    }).focus();
  });
})(jQuery)
