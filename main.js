var DEBUG_MODE = true;
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
});

chrome.runtime.onMessageExternal.addListener(function(msg, sender, responder) {
  if (chrome.serial.getDevices) {
    PinoccioSerial = PinoccioSerial2;
  }
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
  program:function() {
    pinoccio.findSerial(function(err, device) {
      if (err) {
        console.error(err);
        return;
      }
      device.saveProgram(msg.program, function(err) {
        var resp = {};
        if (err) {
          resp.error = err;
        }
        console.log("Save done");
        responder(resp);
      });
    });
  },
  detect:function() {
    if (!msg.timeout) {
      return responder({error:"A timeout must be specified when searching for the device."});
    }
    pinoccio.checkForDevice(msg.timeout, function(err, foundIt) {
      var resp = {
        found:foundIt === true ? true : false
      };
      if (err) resp.error = err;
      pinoccio.findSerial(function(err, device) {
        if (!err && device) {
          resp.isOn = true;
          resp.version = "1.0"; // We assume this for now until pinoccio.js allos other versions
        } else {
          resp.isOn = false;
        }
        responder(resp);
      });
    });
  },
  forget:function() {
    pinoccio.forgetDevice(function(err){
      var resp = {};
      if (err) {
        console.error(err);
        res.error = err;
      }
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
      conn.flush(function() {
        console.log("Going to run %s", msg.command.trim());
        conn.unechoWrite(msg.command.trim() + "\n", function() {
          // TODO Make this multiline aware
          conn.readUntilPrompt("> ", function(err, data) {
            var resp = {};
            if (err) {
              resp.error = err;
            } else {
              resp.result = data;
            }
            console.log("Result line is: ", resp);
            responder(resp);
          });
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


