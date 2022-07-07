//
// ********************** GMAIL SETUP **********************
//

// Call this from node with : (note the parentheses)
// const path = __dirname; // Current directory where main.js was launched
// const gmail = require(path + '/libraries/gmail.js')();

// Responsible for sending emails
module.exports = function (credentialsLocation) {
	// Set up file access and read credentials
	const fs = require('fs');

	/*
	The credentials for the email server should be in the file that is passed as "credentialLocation"
	This should be a text file that is JSON formatted with username and password and a default email destination
	For example :
	{
		"defaultRecipient" : "***someEmail@gmail.com here***",
		"username" : "***emailUserName here***",
		"password" : "***emailPassword here ***"
	}
	*/

	let credentials = JSON.parse(fs.readFileSync(credentialsLocation,'utf8'));

	let nodemailer = require('nodemailer');
	let transporter = nodemailer.createTransport({
		service :'gmail',
		auth: {
			user: credentials.username,
			pass: credentials.password
		}
	});

	// "email" is an object with keys "recipient", "subject", "message" -- all optional
	return function (email) {
		// Defaults that will get overriden by "email" object
		let mailOptions = {
			"to" : credentials.defaultRecipient,
			"sender" : credentials.username // This field has to be filled out for it to work with Public Mobile
		}

		for (let key in email) {
			mailOptions[{ // This object is used to translate between "email" given parameters and what nodeMailer is expecting
				"recipient" : "to",
				"subject" : "subject",
				"message" : "text",
			}[key]] = email[key]
		}

		transporter.sendMail(mailOptions, function(error, info){
			if (error) {
				console.log(error)
			}
		});
	}
}
