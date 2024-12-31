//
// This file contains all test functions for debugging
//

// For forcing messages for testing only !!!
function test() {
  setTimeout(function(){
  //setInterval(function(){
    console.log("testing now");
    //let data="ffaf1314005f0e1600006060040c000002000000000004600100001e0000"
    let data="11bf04"
    //                  CT

    // Compute length of final message (+1 for length byte and +1 for checksum byte)
    let length = data.length/2 + 2;
    data = length.toString(16).padStart(2,"0") + data;

    // Compute CRC8 checksum
    let crc = checksum(data);
    data = data + crc;

    readData(Buffer.from(data,'hex'),1)
  },8000)
}


// This is purely for making debugging hex messages easier to see (differences between messages will be highlighted)
function displayMessages(type, content, spa) {
  let noColor = spa.debug.noColor;
  let raw = spa.debug.raw;true;
  let output = "";
  if (spa.testing[type] == undefined) {
    spa.testing[type] = []
  }

  // Don't want to see status update because only time changed
  let check1 = spa.testing[type].join(" ");
  let check2 = content.join(" ");

  if (type == "ff af 13"  ) {
    // Cut out the hours and minutes
    check1 = check1.slice(0,9) + check1.slice(15);
    check2 = check2.slice(0,9) + check2.slice(15);
  }

  // Codes to ignore while debugging
  let ignore = [];
  if (spa.debug.level < 3) { ignore.push("ff af 13","fe bf 00") };
  if (spa.debug.level < 2) { ignore.push("") };
  if (spa.debug.level < 1) { ignore.push("") };
/*
  if (! spa.debug.bf06and07Messages && ! type.match(/bf 0[67]/)) {
    console.log(spa.debug.bf06and07Messages,type.match(/bf 0[67]/)==true)
    return // Ignore bf 06 and 07 messages
  }
*/
  if (spa.debug.level == 4 || (spa.debug.level > 0 && (ignore.indexOf(type) == -1) && ! type.match(/bf 0[67]/))) { // Ignore CTS from other channels and anything in ignore list
    if (! raw) {
      if (check1 != check2) {  // Let's see what's changed with the last update
        let output = [];

        for (let i=0; i<content.length;i++) {

          if (spa.testing[type][i] != content[i] && ! noColor) {
            output.push("\033[93m" + content[i] + "\033[37m") // splash of yellow color
          } else {
            output.push(content[i])
          }
        }

        if (incoming[type] != undefined) {
          console.log("type: ",type," (",incoming[type].description,")")
        } else {
          console.log("type: ",type)
        }

        if (spa.testing[type].length > 0 || output.length > 0) {
          console.log("old: ",spa.testing[type].join(" "));
          console.log("new: ",output.join(" "));
        }
        if (incoming[type] != undefined && incoming[type].codeLine != undefined) {
          console.log("code:",incoming[type].codeLine.join(" "))
        }

        spa.testing[type] = [...content]; // clone array
      }
    } else if ((spa.debug.level > 0 && ! type.match(/bf 0[67]/) && type != "ff af 13") || spa.debug.allMessages || (spa.debug.statusUpdatesRecord && type == "ff af 13" && ! type.match(/bf 0[67]/))) {   
      console.log(type,content.join(" "));
    }
  }
}


function debug(message, level, spa) {
  if (level <= spa.debug.level) {
    console.log(message);
  }
}


module.exports = {
  test,
  displayMessages,
  debug
}