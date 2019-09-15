const SerialPort = require('serialport')
const port = new SerialPort('/dev/ttyAMA0', {
  baudRate: 19200
})

//sendData("test");

function sendData(data) {
	console.log("Sending: " + data);

	port.write(data, function(err) {
	  if (err) {
	    return console.log('Error on write: ', err.message)
	  }
	})
}

// Open errors will be emitted as an error event
port.on('error', function(err) {
  console.log('Error: ', err.message)
})

// Switches the port into "flowing mode"
port.on('data', function (data) {
  console.log('Data received:', data)
})