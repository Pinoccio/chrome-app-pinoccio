var DEBUG_MODE = true;
var serial = chrome.serial;
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

function ab2str(buf) {
  var bufView=new Uint8Array(buf);
  var unis=[];
  for (var i=0; i<bufView.length; i++) {
    unis.push(bufView[i]);
  }
  console.log(unis);
  return String.fromCharCode.apply(null, unis);
}

function processResponse(buf) {
  var resp = {};
  var dv = new DataView(buf);
  resp.start = dv.getUint8(0);
  resp.seq = dv.getUint8(1);
  resp.msgLen = dv.getUint16(2, false);
  resp.msg = [];
  var cur = 3;
  for (var i = 0; i < resp.msgLen; ++i) {
    resp.msg.push(dv.getUint8(cur + i));
  }
  resp.checksum = dv.getUint8(buf.byteLength - 1);

  return resp;
}

var cmdReadStates = ["Start", "GetSequenceNumber", "GetMessageSize1", "GetMessageSize2", "GetToken", "GetData", "GetChecksum", "Done"];
function readCmd(conn, timeout, cbDone) {
  var state = 0;
  var timedout = false;
  if (typeof timeout === "function") {
    cbDone = timeout;
    timeout = undefined;
  }
  if (timeout === undefined) timeout = 2000;
  setTimeout(function() { timedout = true; }, timeout);
  async.whilst (function() {
    return state < cmdReadStates.length && !timedout
  }, function(cbStep) {
    conn.read(1, function(readInfo) {
      console.log("Read some");
      if (readInfo.bytesRead > 0) {
        var curByte = (new Uint8Array(readInfo.data))[0];
        debugLog("Read: %d %s", curByte, String.fromCharCode(curByte));
      }
      cbStep();
    });
  }, function(err) {
  })
}

var seq = 0;
function sendBootloadCommand(port, msg) {
  var bufLen = 6 + msg.length;
  var buffer = new ArrayBuffer(bufLen);
  var dv = new DataView(buffer);
  var checksum = 0;
  dv.setUint8(0, 0x1b);
  checksum ^= 0x1b;
  dv.setUint8(1, seq);
  checksum ^= seq;
  dv.setUint16(2, msg.length, false);
  checksum ^= dv.getUint8(2);
  checksum ^= dv.getUint8(3);
  dv.setUint8(4, 0x0e);
  checksum ^= dv.getUint8(4);
  for (var x = 0; x < msg.length; ++x) {
    dv.setUint8(5 + x, msg[x]);
    checksum ^= msg[x];
  }
  dv.setUint8(bufLen - 1, checksum);

  console.log("Buffer:");
  for (var i = 0; i < 6 + msg.length; ++i) {
    console.log("%d", dv.getUint8(i));
  }

  var conn = new SerialConnection();
  conn.connect(port, function() {
    conn.setControlSignals({rts:false, dtr:false}, function() {
      setTimeout(function() {
        conn.setControlSignals({rts:true, dtr:true}, function() {
          setTimeout(function() {
            conn.read(100, function(readInfo) {
              //setTimeout(function() {
              conn.writeRaw(buffer, function() {
                readCmd(conn, function() {
                })
              });
            });
           }, 50);
          });
        }, 250);
      });
    });

  ++seq;
  if (seq > 0xff) seq = 0;
}

function getPorts(cbDone) {
  var usbttyRE = /tty\.usb/g;
  var port;
  chrome.serial.getPorts(function(ports) {
    async.detect(ports, function(portName, cbStep) {
      console.log("Trying ", portName);
      if (usbttyRE.test(portName)) {
        sendBootloadCommand(portName, [0x31]);
        return;
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

