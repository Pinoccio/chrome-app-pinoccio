var DEBUG_MODE = false;
var timeout = 100;
var clientSock;

var myLog = Function.prototype.bind.call(console.log, console);
function debugLog() {
  if (DEBUG_MODE) {
    var args = Array.prototype.slice.call(arguments, 0);
    myLog.apply(console, args);
  }
}


chrome.app.runtime.onRestarted.addListener(function(data) {
  console.log("We restarted");
});

chrome.runtime.onStartup.addListener(function(details) {
  console.log("onStartup ", details);
});

chrome.runtime.onInstalled.addListener(function(details) {
  console.log("Installed", details);
});

chrome.runtime.onSuspend.addListener(function() {
  chrome.storage.local.set({lastUsedSocket:null});
});

chrome.runtime.onMessageExternal.addListener(function(msg, sender, responder) {
// TODO:  Bootloader type stufff
/*
   var device = new pinoccio.Device(port);
   device.connect(portName, function() {
     device.signOn(function() {
       console.log("DONE READ");
       return;
     });
   });
 */
var cmds = {
  detect:function() {
    if (!msg.timeout) {
      return responder({error:"A timeout must be specified when searching for the device."});
    }
    pinoccio.checkForDevice(msg.timeout, function(err, foundIt) {
      var resp = {
        found:foundIt === true ? true : false
      };
      if (err) resp.error = err;
      responder(resp);
    });
  },
  close:function() {
  },
  bitlash:function() {
    // TODO:  Support timeout
    pinoccio.findSerial(function(err, device) {
      if (err) {
        console.error(err);
        return;
      }

      if (!device) {
        console.error("Can't find the pinoccio");
        return;
      }

      console.log("We got it!");
      var conn = device.conn;

        console.log("Going to run %s", msg.command.trim());
        conn.unechoWrite(msg.command.trim() + "\n", function() {
          // TODO Make this multiline aware
          conn.readUntilPrompt("\n>", function(data) {
            console.log("Result line is: ", data);
            responder({result: data});
          });
        });
    });
  }
};

if (!cmds.hasOwnProperty(msg.op)) {
  return responder({error:"Unknown op"});
}

cmds[msg.op]();

return true; // required if we want to respond after the listener
});

chrome.app.runtime.onLaunched.addListener(function(data) {
  console.log("We launched");

  var a = document.createElement('a');
  a.href = "http://hq.pinocc.io";
  a.target='_blank';
  a.click();
});

