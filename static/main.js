(function($) {
  function App() {
    this.users = {};
    this.albums = {};
    this.appDiv = $('#app');
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

  App.prototype.getUser = function(userKey, callback) {
    var self = this;

    self.api('getUser', {key: userKey}, function(result) {
      self.users[userKey] = result;
      callback(self.users[userKey]);
    });
  };

  App.prototype.init = function() {
    var self = this;

    self.getUser('s233', function(user) {
      self.appDiv.append('<div>' + user.firstName + '</div>');
    });
  };

  var app = new App();
  app.init();
})(jQuery)
