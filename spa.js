// Set up GPIO access
let gpio = require('onoff').Gpio;
let re_de = new gpio(4,'high'); // Physical pin 7
let Vcc = new gpio(17,'high'); // Physical pin 11

// Release all GPIOs on exit
process.on('SIGINT', function () {
	re_de.unexport();
	Vcc.unexport();
	process.exit()
})


// Set up serial port
const SerialPort = require('serialport')
const port = new SerialPort('/dev/ttyAMA0', {
  baudRate: 19200
})

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
  console.log('Open Error: ', err.message) // ??? Will this ever happen since I left AutoOpen to default???
})

// Switches the port into "flowing mode"
port.on('data', function (data) {
  console.log('Data received:', data)
})

//sendData("test");
console.log("Ready!");