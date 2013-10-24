var serial = chrome.serial;
var timeout = 100;
var VENDOR_ID = 0x1d50;
var PRODUCT_ID = 0x6051;



function checkForDevice() {
  console.log("Checking for USB device");
  chrome.usb.getDevices({"vendorId": VENDOR_ID, "productId": PRODUCT_ID}, function(devices) {
    console.log("Found ", devices);
    if (devices && devices.length > 0) {
      console.log("GO GO!");
    } else {
      setTimeout(checkForDevice, 1000);
    }
  });
}

function getPerms() {
  console.log("We're getting perms!");
  chrome.permissions.request({
    permissions: [
      {'usbDevices': [{'vendorId': VENDOR_ID, "productId": PRODUCT_ID}] }
    ]
  }, function(result) {
    console.log(result);
    if (result) { 
      checkForDevice();
      console.log('App was granted the "usbDevices" permission.');
    } else {
      console.log('App was NOT granted the "usbDevices" permission.');
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


chrome.app.runtime.onLaunched.addListener(function(data) {
  console.log("We started");

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



  getPorts(function(conn) {
    if (!conn) {
      console.error("Can't find the pinoccio");
      return;
    }
    var server = new TcpServer("127.0.0.1", 16402, {maxConnections:1});
    server.listen(function(sock) {
      sock.addDataReceivedListener(function(data) {
        conn.waitForPrompt("\n> ", function() {
          console.log("Going to run %s", data.trim());
          conn.unechoWrite(data.trim() + "\n", function() {
            conn.readLine(function(line) {
              console.log("Result line is: ", line);
              sock.sendMessage(line, function() {
                console.log("We sent it");
                server.disconnect();
              });
            });
          });
        });
      });
    });
  });
});

