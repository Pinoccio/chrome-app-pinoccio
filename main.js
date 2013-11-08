var DEBUG_MODE = false;
var timeout = 100;
var VENDOR_ID = 0x1d50;
var PRODUCT_ID = 0x6051;
var clientSock;
var tcpServer;
var haveDevice = false;

var myLog = Function.prototype.bind.call(console.log, console);
function debugLog() {
  if (DEBUG_MODE) {
    var args = Array.prototype.slice.call(arguments, 0);
    myLog.apply(console, args);
  }
}

var findAttempts = 0;
function checkForDevice(onFound) {
  haveDevice = false;
  console.log("Checking for USB device");
  chrome.usb.getDevices({"vendorId": VENDOR_ID, "productId": PRODUCT_ID}, function(devices) {
    if (devices && devices.length > 0) {
      haveDevice = true;
      console.log("FOUND IT");
      onFound(true);
    } else {
      // TODO:  A max number of attempts?
      findAttempts += 1;
      setTimeout(function() { checkForDevice(onFound); }, 500);
    }
  });
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

        var device = new pinoccio.Device(port);
        device.connect(portName, function() {
          device.signOn(function() {
            console.log("DONE READ");
            return;
            tryPinoccioSerial(portName, function(conn) {
              if (!conn) return cbStep(false);
              console.log("This is the one: ", portName);
              port = conn;
              cbStep(true);
            });
          });
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
  tcpServer.disconnect();
  chrome.storage.local.set({lastUsedSocket:null});
});

chrome.app.runtime.onLaunched.addListener(function(data) {
  console.log("We launched");

  /*
  getPerms();

      chrome.app.window.create('main.html', { 
        id: 'main',
        bounds: {width: 300, height: 300}
      }, function(appWin) {
        setTimeout(function() {
          console.log(appWin.contentWindow.document.getElementById);
          var E = appWin.contentWindow.document.querySelector("#startIt");
          console.log(E);
          E.addEventListener("click", function() {
            console.log("In the button");
            getPerms();
          });
        }, 1000);
      });
  */
  // This magic is to work around a bug when you reload locally multiple times
  // and you basically cause an EADDRINUSE.  Here we forcibly make sure the last
  // one is gone.
  chrome.storage.local.get(["lastUsedSocket"], function(item) {
    if (item.lastUsedSocket > 0) {
      chrome.socket.disconnect(item.lastUsedSocket);
    }
    chrome.socket.getInfo(1, function(info) {
      console.log("socket info", info);
    });
    if (tcpServer === undefined) {
      var tcpServer = new TcpServer("127.0.0.1", 16402, {maxConnections:1});
      tcpServer.listen(function(result) {
        console.log("TCP Server is listening");
        chrome.storage.local.set({lastUsedSocket:tcpServer.serverSocketId});
      }, function(newSock) {
        clientSock = newSock;
        if (haveDevice) {
          clientSock.sendMessage("{\"haveDevice\":true}");
        }
      });
    }
  });

  checkForDevice(function(foundIt) {
    if (!foundIt) {
      console.error("We got called back, but didn't find a device.");
      return;
    }
    if (clientSock) {
      clientSock.sendMessage("{\"haveDevice\":true}");
    }
    getPorts(function(conn) {
      if (!conn) {
        console.error("Can't find the pinoccio");
        return;
      }

      if (clientSock) {
        clientSock.addDataReceivedListener(function(data) {
          conn.waitForPrompt("\n> ", function() {
            console.log("Going to run %s", data.trim());
            conn.unechoWrite(data.trim() + "\n", function() {
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
  });
});

