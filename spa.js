// Set up GPIO access
let gpio = require('onoff').Gpio;
//let Vcc = new gpio(18,'high'); // Physical pin 12
let RE = new gpio(23,'low'); // Physical pin 16
let DE = new gpio(24,'low'); // Physical pin 18

// Release all GPIOs on exit
process.on('SIGINT', function () {
	Vcc.unexport();
	RE.unexport();
	DE.unexport();
	process.exit()
})


// Set up serial port
const SerialPort = require('serialport')
const port = new SerialPort('/dev/ttyAMA0', {
  baudRate: 115200
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
  console.log('General error: ', err.message) // ??? Will this ever happen since I left AutoOpen to default???
})

// Switches the port into "flowing mode"
port.on('data', function (data) {
  console.log(data); // data.toString() to get ASCII character
})


console.log("Ready!");
//sendData("test");

// HEX to decimal and ASCII
//https://www.rapidtables.com/convert/number/ascii-to-hex.html
