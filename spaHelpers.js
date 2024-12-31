//
// This file contains all extra functions that don't directly interact with spa
//

// For text notifications
function getGmail(path) {
  // See gmail.js file for details on spa.credentials file format
  let result;
  try {
    result = require(`${path}/gmail.js`)(`${path}/../spa.credentials`);
  } catch(err) {
    // An error here is not critical -- program will still function
    console.log("WARNING : Error when setting up gmail script.  Texting will not be available.");
    //console.log(err); // Uncomment to see detailed error
  }
  return result; // undefined if error
}

// For text notifications
function getAddressBook(fs, path) {
  /*
  - addressBook is a text file that matches IP addresses to emails
  - when a user asks for text notification in the web interface, the IP address is obtained 
  so that it can be matched up in the address book to an email address, and finally sent to an "email to text server"
  - text file has this format, one IP per line :
  {
  "192.168.1.someNumber" : "phoneNumber@someProvider",
  }
  */
  let result;
  try {
    result = JSON.parse(fs.readFileSync(`${path}/../spa.addressbook`,'utf8'));
  } catch(err) {
    // An error here is not critical -- program will still function
    console.log("WARNING : Error parsing address book.  Texting will not be available.");
    //console.log(err); // Uncomment to see detailed error
  }
  return result; // undefined if error
}


// Email to text function: some cell phone carriers allow sending an email to a phone number that will be converted to a SMS
function textPhone(gmail, messageType, ipAddress, messageContent, spa) {
  if (messageType == "ST" && ipAddress in addressBook) {
    console.log(`Texting phone number listed under ${ipAddress}`);
    gmail({
      recipient: addressBook[ipAddress],
      message  : `Hot tub has reached ${messageContent} F.\nOutdoor ${spa.weather.current.temperature} C, feels like ${spa.weather.current.feelsLike} C.\nWind ${spa.weather.current.wind} kph, gusting ${spa.weather.current.wind} kph.${takeaHat()}`
    })
  } else if (messageType == "ER") {
    gmail({
      message: `New error in spa detected!`
    })
  }

  // Determines whether to recommend to take a hat or not
  function takeaHat() {
    if (spa.weather.current.temperature <= 0 && spa.weather.current.wind >= 10) {
      return "\nTake a hat!"
    }
    return "" // Return nothing if conditions not met
  }
}


// Check every minute for internet connectivity, reset Pi if no internet (maybe something went wrong with wifi radio?)
function checkConnectivity(numFails) {
  // Set up command line access
  cmd = require('node-cmd');

  cmd.get('ping -c 5 8.8.8.8',
    function(err, data, stderr){
      if (err) {
        numFails++;

        if (numFails == 5) {
        console.log("Toggling radios");
          cmd.run('sudo ip link set wlan0 down && sudo ip link set wlan0 up');
          console.log("Radios toggled");
        } else if (numFails == 10) {
          console.log("Attempting reboot");
          cmd.run('sudo reboot');
        }
      } else {
        numFails = 0;
      }
      setTimeout(function(){checkConnectivity(numFails)}, 60000); // Every minute
    }
  )
}


// Initial call for weather data (frequent at first, then every 5 minutes when data received)
let weatherIntervalHandle;
function initWeather(spa, io) {
  weatherIntervalHandle = setInterval( () => {
    if (Object.keys(spa.weather).length > 0) { // Weather up for initial call ?
      clearInterval(weatherIntervalHandle); // Stop initial call timer
      setInterval( () => fetchWeather(spa, io), 5 * 60 * 1000); // Every 5 minutes from now on
    } else {
      fetchWeather(spa, io);
    }
  }, 5 * 1000);
}


// Set up client requests for weather
function fetchWeather(spa, io) {
  /* Note : this is a weather server that I run on the same Pi.  It gets weather info
     from The Weather Network every 10 minutes and sends it out to any device that request it
     on my network.  That way, my devices always see the same JSON structure and my server can
     be modified if TWN ever catches on.

     If people are interested, I could make the weather repo public.
  */
  let request = require("request2.0");
  request({"url": "http://192.168.1.58:3000", "json": true}, function (error, response, body) {
    if (! error && response.statusCode === 200 && body != undefined) {
      let params = { // Weather parameters I want to pick up
        current : ["icon","temperature","feelsLike","wind","windDir","windGust","high","low","sunrise","sunset","sunrise_gmt","sunset_gmt","airQualityIndex","airQualityLevel","moonRise","moonSet","moonPhase"],
        hourly : ["hour","milli","icon","temperature","feelsLike","wind","windDir","windGust","POP","rain","snow"]
      };

      for (let key in params) {
        if (! spa.weather[key]) { // Avoid undefined
          spa.weather[key] = {};
        }
        params[key].forEach(parameter => {
          if (body[key][parameter] != undefined) {
            spa.weather[key][parameter] = body[key][parameter];
          }
        });
      }

      io.emit('weather',spa.weather); // Send to all connected clients
    }
  })
}


// *************** Graph set up ***************
const debugTools = require('./spaDebug'); // Dependency

function initGraph(fs, path, spa, io, graphData) {
  // Read file to get data (if it exists)
  fs.readFile(`${path}/graphData`,'utf8', function(err,data) {
    if (err) {
      console.log("WARNING: Error reading graph data from file OR file does not exist.")
    } else {
      debugTools.debug("Graph data was read from file.", 1, spa);
      let parsedData = JSON.parse(data);
      parsedData = parsedData.filter(dataPoint => (Date.now() - new Date(dataPoint[0]*1000))<=24*60*60*1000); // Only retain last 24 hours worth of data (only useful if program was not working for quite a while and so not gathering data -- it messes with the graph!)
      
      // Update graphData: it MUST be done this way so that the reference to graphData is not lost and the original array is modified
      graphData.length = 0; // Clear the array
      graphData.push(...parsedData); // Add new elements
    }
  });

  // Read temperatures every 5 minutes for graph
  setTimeout(function(){
    setInterval(function() {
      // Sometimes on boot, the weather service is not ready to give out weather when spa.js is started, so the weather is undefined
      if (Object.keys(spa.weather).length > 0) {
        return // Abort function -- no weather data
      }

      // Data format ['Time','Spa','Exterior','Heating']
      let heatStatus = 0;
      if (["2c","1c","28","18"].includes(spa.HF)) {
        heatStatus = 1
      }

      // Time to nearest minute[0], spa temperature[1], outside temperature[2], heat status[3]
      graphData.push([Math.round(new Date().getTime()/1000/60)*60,parseInt(spa.CT,16),parseInt(spa.weather.current.temperature,10),heatStatus]);

      // Keep only last 24 hours data (12 data points per hour and 24 h) -- 5 minutes resolution
      if (graphData.length >= 288) {
        graphData.shift()
      }

      io.emit('graphData',graphData);
    },5*60000);
  }, 5 * 60000 - Date.now() % (5 * 60000)); // Start recording graph data at the nearest 5 min interval


  // Save to file every hour
  setInterval(function() {
    fs.writeFile('graphData', JSON.stringify(graphData), 'utf8', function(err) {
      if (err) {
        console.log("Error saving graph data: " + err)
      } else {
        //console.log('Graph data saved.');
      }
    });
  },60*60000);
}


function setTimer(timers, spa, onOffFlag = "") {
  const timerSettings = {
    on: {
      tempToSet: 80
    },
    off: {
      tempToSet: 99
    }
  };

  let currentTime = Date.now();

  // Raise or lower temperature based on schedule
  if (! onOffFlag) { // First time running ?
    spa.lastChangeToTemp = currentTime;

  } else {
    if (currentTime - spa.lastChangeToTemp > 2 * 60 * 60 * 1000) { // More than 2 hours since last change to temperature? Otherwise we consider that wife changed temp for later, so don't touch it!
      console.log(`Setting to ${timerSettings[onOffFlag].tempToSet} F to save electricity on ${new Date()}`);
      sendCommand("setTemp",timerSettings[onOffFlag].tempToSet); // Lower or raise temperature to save electricity
    } else {
      console.log(`Temperature modified on ${new Date(spa.lastChangeToTemp)}, no change applied at ${new Date()}.`);
    }    
  }

  // Figure out the timing for the next check
  let futureTime = {};
  for (let key in timers) {
    futureTime[key] = new Date().setHours(timers[key],0,0,0);
    if (futureTime[key] < currentTime) { // Is it in the past ?
      futureTime[key] += 24 * 60 * 60 * 1000; // Add 24 hours
    }
  }

  let closestInFuture = "off"; // By default, will change below if not true
  if (futureTime.on < futureTime.off) { // "on" time is closer in the future
    closestInFuture = "on";
  }

  setTimeout(
    () => setTimer(timers,closestInFuture), // Give it "on" or "off" for next time as closestInFuture
    futureTime[closestInFuture] - currentTime // Delay until next on/off check
  );
}


// Figures out how much time to heat the hot tub
function estimatedTime(graphData, spa, io) {
  // Compute delta time and delta temp for heating rate
  let periods = [[],[]]; // [0,1 : cooling/heating][ [ [time,temperature],[time,temperature] ] , [ [time,temperature],[time,temperature] ] ]
  let lastHeatingRead;

  // Pick out heating and cooling periods
  for (let i = 0; i < graphData.length; i++) {
    // If it's not heating, it's cooling
    if (graphData[i][3] != lastHeatingRead) {
      periods[graphData[i][3]].push([])
    }
    periods[graphData[i][3]][periods[graphData[i][3]].length - 1].push([graphData[i][0],graphData[i][1]]);

    lastHeatingRead = graphData[i][3];
  }

  // Find the longest periods of cooling and heating
  let maxLength = [0,0];
  let longestInterval = [-1,-1]; // Set -1 to detect if it was modified
  for (let i = 0; i <=1; i++) {
    for (let j = 0; j < periods[i].length; j++) {
      if (periods[i][j].length > maxLength[i]) {
        maxLength[i] = periods[i][j].length;
        longestInterval[i] = j;
      }
    }
  }

  // Compute delta time and delta temp for cooling/heating rate (should be in deg F per second)
  for (let i = 0; i <=1; i++) {
    if (longestInterval[i] != -1) { // If we found an interval
      spa.rates[["cool","heat"][i]] = polysolve(periods[i][longestInterval[i]],1)[1] * 60; // Only pick out the slope, mutiply by 60 for per minute rate
    }
  }

  let deltaT = parseInt(spa.ST,16) - parseInt(spa.CT,16);
  let rate = 0;

  if (deltaT > 0) { // We're heating
    rate = spa.rates.heat
  } else if (deltaT < 0) { // We're letting it cool
    rate = spa.rates.cool
  }

  let time = new Date();
  if (rate != 0) {
    time.setMinutes(time.getMinutes() + deltaT/rate);
    spa.estimatedTime = `(${time.getHours().toString().padStart(2,"0")}:${time.getMinutes().toString().padStart(2,"0")})`;
    spa.deltaT = deltaT; // Just for something to check for background color in script.js
  } else {
    spa.estimatedTime = "";
  }

  io.emit('data',{estimatedTime : spa.estimatedTime}); // Converting date objet to HH:MM

  // Polynomial best fit solver (written by Raphaël Srawley -- yes, he speaks French too!)
  function polysolve(valeurs,degree) {
    // Référence : https://arachnoid.com/sage/polynomial.html
    // S'attend à un tableau de tableaux (de données) : [ [x1,y1] , [x2,y2] , ... ]

    // Prendre les valeurs de x and la 1e colonne et y dans la 2e
    let x = valeurs.map(donnee => donnee[0]);
    let y = valeurs.map(donnee => donnee[1]);

    let m = []; // Matrice à résoudre
    for (let r=0; r<=degree; r++) { // Row (r)
      m[r] = [];

      for (let c=0; c<=degree; c++) { // Column (c)
        m[r][c] = x.reduce((accumulator, currentValue) => accumulator + currentValue**(r+c), 0); // m[r][c] = m[r][c] + Math.pow(x[i],r+c) // x[i]^(r+c)
      }
    }

    // On rajoute la matrice à droite comme une colonne dans la matrice à gauche
    for (let r=0; r<=degree; r++) { // Row (r)
      m[r].push(valeurs.reduce((accumulator, coord) => accumulator + coord[0]**r*coord[1], 0)); // somme = somme + Math.pow(x[i],r)*y[i];
    }

    // Il faut résoudre la matrice avec élimination Gauss-Jordan
    for (let i=0; i<=degree; i++) {
      let coeff = m[i][i];

      for (let c=0; c<=degree+1; c++) { // Column (c)
        m[i][c] = m[i][c] / coeff; // Ajuster tous les coefficients pour avoir un 1 dans la colonne qu'on veut résoudre
      }

      // Ajuster toute la matrice pour avoir des zéros partout dans la colonne, sauf celle qu'on vient d'ajuster ci-haut
      for (let r=0; r<=degree; r++) {  // Row (r)
        if (r != i) {
          let coeff = m[r][i];

          for (let c=0; c<=degree+1; c++) { // Column (c)
            m[r][c] = m[r][c] - coeff * m[i][c];
          }
        }
      }
    }

    // Valeur de retour
    let coefficients = [];
    for (let i=0; i<=degree; i++) {
      coefficients.push(m[i][degree+1]);
    }

    return coefficients; // Array qui contient les coefficients de x^0 à x^n
  }
}


module.exports = {
  getGmail,
  getAddressBook,
  textPhone,
  checkConnectivity,
  initWeather,
  fetchWeather,
  initGraph,
  setTimer,
  estimatedTime
}