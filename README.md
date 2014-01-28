pinoccio-chrome-app
===================

Available messages to send

###waitForUnplug
This will cause the system to watch the USB devices and report when it no longer sees a Pinoccio device connected.

Arguments:
* _cancel_ - (Boolean) - On true this will cancel a previously running unplug loop.
* _interval_ - (Number) - The number of milliseconds to wait between checks.  This is _REQUIRED_ and is suggested around 250 for responsiveness.

Response:
* _unplugged_ - (Boolean) - Exists and is true if the device was detected unplugged.
* _msg_ - (String) - Helpful message of what happened.
* _error_ - (String) Exists only if an error occurs and provides some information as to why.

###fetchAndProgram
This will fetch a hex program file from a remote site and flash it onto the connected board.

Arguments:
* _url_ - (String) - url to download the hex program file from.

Response:
* _error_ - (String) Exists only if an error occurs and provides some information as to why.

An empty response ({}) is returned on a success.

###detect
Checks that a Pinoccio device is connected and verifies that we can communicate with it.

Arguments:
* _timeout_ - (Number) - The number of milliseconds to wait in total before failing.

Response:
* _found_ - (Boolean) - true if we can detect the device is connected to USB.
* _isOn_ - (Boolean) - true if the device appears to be powered on and communication succeeds.
* _version_ - (Static String) - Currently statically returns 1.0
* _error_ - (String) Exists only if an error occurs and provides some information as to why.

###forget
Resets the internal connected device to none.

###bitlash
Runs the given bitlash command and returns a result.

Arguments:
* _command_ - (String) - The bitlash command to run.  This is trimmed of whitespace.

Response:
* _result_ - (String) - The raw results of the bitlash command as a string.
* _error_ - (String) Exists only if an error occurs and provides some information as to why.


###program
This will flash a passed in program, prefer _fetchAndProgram_ currently.
###close
Currently a noop
