//
// Experimental functions, currently not used at all
//

/* ==================
// EXPERIMENTAL : Interfacing with Google Home so that I can ask/set temperature with "OK Google"

// Set up API -- information request
app.get('/:getInfo',function(req,res,next) {
  let validReq = ["CT","ST"];

  if (req.params.apiRequest != undefined) { // Valid request
    if (validReq.includes(req.params.apiRequest)) {
      res.status(200).json(parseInt(spa[req.params.apiRequest],16));
    } else {
      res.status(400).json("Requested info type not available.  Available types are: " + validReq.toString())
    }
  }
})

// Set up API -- action request
app.get('/:action',function(req,res,next) {
  let validReq = ["ST"];

  if (req.params.apiRequest != undefined) { // Valid request
    if (validReq.includes(req.params.apiRequest)) {
      res.status(200).json("OK");
    } else {
      res.status(400).json("Requested forecast type not available.  Available types are: " + validReq.toString())
    }
  }
})
================== */