var serial = chrome.serial;
var VENDOR_ID = 0x1d50;
var PRODUCT_ID = 0x6051;

(function() {

function Device() {
  this.conn = undefined;
  this.blSeq = 1; // Bootloader command sequence
}
Device.prototype.connect = function(port, cbDone) {
  if (this.conn) setTimeout(cbDone, 0);

  this.conn = new SerialConnection();
  this.conn.connect(port, function(err) {
    cbDone(err);
  });
};
Device.prototype.restart = function(cbDone) {
  var self = this;
  async.series([
    function(cbStep) {
      self.conn.setControlSignals({rts:true, dtr:true}, function() {
        cbStep();
      });
    },
    function(cbStep) {
      setTimeout(cbStep, 250);
    },
    function(cbStep) {
      self.conn.setControlSignals({rts:false, dtr:false}, function() {
        cbStep();
      });
    },
    function(cbStep) {
      setTimeout(cbStep, 50);
    }
  ], function(err) {
    cbDone(err);
  });
};
Device.prototype.drain = function(cbDone) {
  var self = this;
  self.conn.flush(function() {
    self.conn.read(300, function(readInfo) {
      self.conn.flush(function() {
        cbDone();
      });
    });
  });
};
Device.prototype.sendBootloadCommand = function(msg, cbDone) {

  var bufLen = 6 + msg.length;
  var buffer = new ArrayBuffer(bufLen);
  var dv = new DataView(buffer);
  var checksum = 0;
  dv.setUint8(0, 0x1b);
  checksum ^= 0x1b;
  dv.setUint8(1, this.blSeq);
  checksum ^= this.blSeq;
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

  ++this.blSeq;
  if (this.blSeq > 0xff) this.blSeq = 0;

  this.conn.writeRaw(buffer, function() {
    this.readBootloadCommand(cbDone);
  }.bind(this));

  /*

  var conn = new SerialConnection();
  conn.connect(port, function() {
    conn.setControlSignals({rts:true, dtr:true}, function() {
      setTimeout(function() {
        conn.setControlSignals({rts:false, dtr:false}, function() {
          setTimeout(function() {
            conn.read(100, function(readInfo) {
              //setTimeout(function() {
                readCmd(conn, function() {
                })
              });
            });
           }, 50);
          });
        }, 250);
      });
    });

    */
}

var cmdReadStates = ["Start", "GetSequenceNumber", "GetMessageSize1", "GetMessageSize2", "GetToken", "GetData", "GetChecksum", "Done"];
Device.prototype.readBootloadCommand = function(timeout, cbDone) {
  var self = this;
  var state = 0;
  var timedout = false;
  var pkt = {
    message : [],
    messageLen : [],
    checksum:0
  };
  if (typeof timeout === "function") {
    cbDone = timeout;
    timeout = undefined;
  }
  if (timeout === undefined) timeout = 2000;
  setTimeout(function() { timedout = true; }, timeout);
  async.whilst (function() {
    return state < (cmdReadStates.length - 1) && !timedout
  }, function(cbStep) {
    self.conn.read(1, function(readInfo) {
      if (readInfo.bytesRead > 0) {
        var curByte = (new Uint8Array(readInfo.data))[0];
        debugLog("Read: state(%s) byte(%d) char(%s)", cmdReadStates[state], curByte, String.fromCharCode(curByte));
      }
      pkt.checksum ^= curByte;
      switch(state) {
      case 0:
        if (curByte != 0x1b) {
          return cbStep("Invalid header byte");
        }
        ++state;
        break;
      case 1:
        if (curByte != self.blSeq - 1) {
          return cbStep("Invalid sequence number");
        }
        ++state;
        break;
      case 2:
        pkt.messageLen.push(curByte);
        ++state;
        break;
      case 3:
        pkt.messageLen.push(curByte);
        pkt.messageLen = (pkt.messageLen[0] << 8) | pkt.messageLen[1];
        ++state;
        break;
      case 4:
        if (curByte != 0x0e) {
          return cbStep("Invalid message marker byte");
        }
        ++state;
        break;
      case 5:
        if (--pkt.messageLen == 0) ++state;
        pkt.message.push(curByte);
        break;
      case 6:
        pkt.checksum ^= curByte;
        pkt.checksum = (pkt.checksum == curByte) ? true : false;
        ++state;
        break;
      }
      cbStep();
    });
  }, function(err) {
    cbDone(err, pkt);
  })
};

Device.prototype.signOn = function(cbDone) {
  var self = this;
  self.restart(function() {
    self.drain(function() {
      self.sendBootloadCommand([0x01], function(err, pkt) {
        console.log("Err", err);
        console.log("Packet: ", pkt);
        cbDone();
      });
    });
  });
}
/* TODO:  The chip doesn't like how avrdude does this so we're still researching
Device.prototype.erase = function(cbDone) {
  self.sendBootloadCommand([], function(err, pkt) {
  });
};
*/

var overallTimer;
function checkForDevice(timeout, onFound) {
  console.log(arguments);
  // Wrap the found callback to deal with timer triggers
  var foundTriggered = false;
  function foundWrapper(err, found) {
    if (foundTriggered) return;
    if (overallTimer !== undefined) clearTimeout(overallTimer);
    if (curTimer !== undefined) clearTimeout(curTimer);
    foundTriggered = true;
    var args = Array.prototype.slice.call(arguments, 0);
    onFound(err, found);
  };

  // Overall timeout
  if (overallTimer === undefined) {
    overallTimer = setTimeout(function() {
      console.log("TIMEOUT");
      overallTimer = undefined;
      clearTimeout(curTimer);
      return foundWrapper("Timeout waiting for device", false);
    }, timeout);
  }

  console.log("Checking for USB device");
  var curTimer;
  chrome.usb.findDevices({"vendorId": VENDOR_ID, "productId": PRODUCT_ID}, function(devices) {
    if (devices && devices.length > 0) {
      console.log("our USB is plugged in");
      foundWrapper(null, true);
    } else {
      if (!foundTriggered) {
        curTimer = setTimeout(function() {
          curTimer = undefined;
          checkForDevice(0, foundWrapper);
        }, 500);
      }
    }
  });
}

var connectedDevice = undefined;
function findSerial(cbDone) {
  // If we're already connecte just short circuit
  if (connectedDevice) {
    console.log("Using already connected device.");
    return cbDone(null, connectedDevice);
  }

  var usbttyRE = /tty\.usb/g;
  var port;
  chrome.serial.getPorts(function(ports) {
    async.detect(ports, function(portName, cbStep) {
      console.log("Trying ", portName);
      if (usbttyRE.test(portName)) {
        trySerial(portName, function(conn) {
          if (!conn) return cbStep(false);
          console.log("This is the one: ", portName);
          port = portName;
          connectedDevice = new Device;
          connectedDevice.conn = conn;
          cbStep(true);
        });
      } else {
        cbStep(false);
      }
    }, function(result) {
      if (!result) return cbDone("Could not find the device");

      return cbDone(null, connectedDevice);
    });
  });
}

function trySerial(port, cbDone) {
  var conn = new SerialConnection();
  var foundIt = false;
  async.series([
    function(cbStep) {
      //console.log("Connecting");
      conn.connect(port, cbStep);
    },
    function(cbStep) {
      //console.log("Timeout");
      setTimeout(cbStep, 500);
    },
    function(cbStep) {
      //console.log("Flushing");
      conn.flush(function() {
        conn.read(300, function(readInfo) {
          conn.flush(function() {
            cbStep();
          });
        });
      });
    },
    /*
    function(cbStep) {
      conn.unechoWrite("\n", function() {
        cbStep();
      });
    },
    function(cbStep) {
      conn.waitForPrompt("\n> ", function() {
        cbStep();
      });
    },
    */
    function(cbStep) {
      conn.unechoWrite("scout.report\n", function(writeInfo) {
        cbStep();
      });
    },
    function(cbStep) {
      conn.readUntilPrompt("\n>", function(err, readData) {
        if (err) return cbStep(err);
        console.log("Read -%s-", readData);
        if (readData.trim() == "1.0") {
          console.log("Found it");
          foundIt = true;
        }
          cbStep();
      });
    }],

    function(err) {
      cbDone(foundIt ? conn : undefined);
    }
  );
}

window.pinoccio = {
  Device:Device,
  checkForDevice:checkForDevice,
  findSerial:findSerial
};

})(window);
