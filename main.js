var DEBUG_MODE = false;
var timeout = 100;
var clientSock;
var tcpServer;

var myLog = Function.prototype.bind.call(console.log, console);
function debugLog() {
  if (DEBUG_MODE) {
    var args = Array.prototype.slice.call(arguments, 0);
    myLog.apply(console, args);
  }
}

function tryPinoccioSerial(port, cbDone) {
  var conn = new SerialConnection();
  conn.connect(port, function() {
    console.log("connected done");
    setTimeout(function() {
      console.log("timeout done");
      // This gets everything off the line
      conn.read(1024, function(readInfo) {
        conn.unechoWrite("\n", function() {
          conn.waitForPrompt("\n> ", function() {
            console.log("Skipping: ", conn.ab2str(readInfo.data));
            conn.unechoWrite("print pinoccio.version\n", function(writeInfo) {
              conn.readLine(function(readData) {
                console.log("Read -%s-", readData);
                if (readData.trim() == "256") {
                  console.log("Found it");
                  cbDone(conn);
                } else {
                  cbDone();
                }
              });
            });
          });
        });
      });
    }, 500);
  });
}


function getPorts(cbDone) {
  var usbttyRE = /tty\.usb/g;
  var port;
  chrome.serial.getPorts(function(ports) {
    async.detect(ports, function(portName, cbStep) {
      console.log("Trying ", portName);
      if (usbttyRE.test(portName)) {
        tryPinoccioSerial(portName, function(conn) {
          if (!conn) return cbStep(false);
          console.log("This is the one: ", portName);
          port = conn;
          cbStep(true);
        });
      } else {
        cbStep(false);
      }
    }, function(result) {
      return cbDone(port);
    });
  });

}

chrome.app.runtime.onRestarted.addListener(function(data) {
  console.log("We restarted");
  // XXX Start the TCP server?
});

chrome.runtime.onStartup.addListener(function(details) {
  console.log("onStartup ", details);
  // XXX Start the TCP server?
});

chrome.runtime.onInstalled.addListener(function(details) {
  console.log("Installed", details);
  // XXX: Start the TCP server?

});

chrome.runtime.onSuspend.addListener(function() {
  //tcpServer.disconnect();
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
    getPorts(function(conn) {
      if (!conn) {
        console.error("Can't find the pinoccio");
        return;
      }

      if (clientSock) {
        clientSock.addDataReceivedListener(function(data) {
          conn.waitForPrompt("\n> ", function() {
            console.log("Going to run %s", data.trim());
            conn.unechoWrite(msg.command.trim() + "\n", function() {
              // TODO Make this multiline aware
              conn.readLine(function(line) {
                console.log("Result line is: ", line);
                clientSock.sendMessage(line, function() {
                  console.log("We sent it");
                  tcpServer.disconnect();
                });
              });
            });
          });
        });
      }
    });
  }
};

if (!cmds.hasOwnProperty(msg.op)) {
  return responder({error:"Unknown op"});
}

cmds[msg.op]();
});

chrome.app.runtime.onLaunched.addListener(function(data) {
  console.log("We launched");

  var a = document.createElement('a');
  a.href = "http://pinocc.io";
  a.target='_blank';
  a.click();
  /*
  pinoccio.checkForDevice(2000, function(err, foundIt) {
    if (!foundIt) {
      console.error("We got called back, but didn't find a device.");
      return;
    }
    if (clientSock) {
      clientSock.sendMessage("{\"haveDevice\":true}");
    }
  });
  */
});

