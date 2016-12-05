"use strict";
/*
    AUTHOR:  Peter van der Walt openhardwarecoza.github.io/donate
    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
    WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
    MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
    ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
    WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
    ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
    OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License.
    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.
    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
var config = require('./config');
var serialport = require("serialport");
var SerialPort = serialport;
var app = require('http').createServer(handler);
var io = require('socket.io').listen(app);
var fs = require('fs');
var nstatic = require('node-static');
var EventEmitter = require('events').EventEmitter;
var url = require('url');
var qs = require('querystring');
var util = require('util');
var http = require('http');
var chalk = require('chalk');
var isConnected, connectedTo, port, isBlocked, lastSent = "", paused = false, blocked = false, statusLoop, queueCounter, connections = [];
var gcodeQueue; gcodeQueue = [];
var request = require('request'); // proxy for remote webcams
var firmware, fVersion = 0;
var feedOverride = 100;
var spindleOverride = 100;
var laserTestOn = false;

const GRBL_RX_BUFFER_SIZE = 128;
var grblBufferSize = [];


require('dns').lookup(require('os').hostname(), function (err, add, fam) {
    console.log(chalk.green(' '));
    console.log(chalk.green('***************************************************************'));
    console.log(chalk.white('                 ---- LaserWeb Started ----                    '));
    console.log(chalk.green('***************************************************************'));
    console.log(chalk.white('  Access the LaserWeb User Interface:                        '));
    console.log(chalk.green('  1. Open Chrome                                              '));
    console.log(chalk.green('  2. Go to : '), chalk.yellow(' http://'+add+':'+config.webPort+'/'));
    console.log(chalk.green('***************************************************************'));
    console.log(chalk.green(' '));
    console.log(chalk.green(' '));
    console.log(chalk.red('* Updates: '));
    console.log(chalk.green('  Remember to check the commit log on'));
    console.log(chalk.green(' '), chalk.yellow('https://github.com/openhardwarecoza/LaserWeb3/commits/master'));
    console.log(chalk.green('  regularly, to know about updates and fixes, and then when ready'));
    console.log(chalk.green('  update LaserWeb3 accordingly by running'), chalk.cyan("git pull"));
    console.log(chalk.green(' '));
    console.log(chalk.red('* Support: '));
    console.log(chalk.green('  If you need help / support, come over to '));
    console.log(chalk.green(' '), chalk.yellow('https://plus.google.com/communities/115879488566665599508'));
});


// Webserver
app.listen(config.webPort);
var fileServer = new nstatic.Server('./public');
function handler (req, res) {

  var queryData = url.parse(req.url, true).query;
  if (queryData.url) {
	if (queryData.url !== "") {
	  request({
        url: queryData.url,  // proxy for remote webcams
        callback: (err, res, body) => {
          if (err) {
            // console.log(err)
            console.error(chalk.red('ERROR:'), chalk.yellow(' Remote Webcam Proxy error: '), chalk.white("\""+queryData.url+"\""), chalk.yellow(' is not a valid URL: '));
          }
        }
      }).on('error', function(e) {
        res.end(e);
	  }).pipe(res);
	}
  } else {
    fileServer.serve(req, res, function (err, result) {
      if (err) {
        console.error(chalk.red('ERROR:'), chalk.yellow(' fileServer error:'+req.url+' : '), err.message);
      }
	});
  }
}


// Websocket <-> Serial
io.sockets.on('connection', handleConnection);


function handleConnection (socket) { // When we open a WS connection, send the list of ports

  connections.push(socket);

  serialport.list(function (err, ports) {
    socket.emit("ports", ports);
  });

  socket.on('firstLoad', function(data) {
    socket.emit('config', config);
  });

  socket.on('stop', function(data) {
    if (isConnected) {
      paused = true;
      console.log(chalk.red('STOP'));
      switch (firmware) {
        case 'grbl':
          port.write('!');              // hold
          port.write(String.fromCharCode(0x9E)); // Stop Spindle/Laser
          gcodeQueue.length = 0;        // dump the queye
          grblBufferSize.length = 0;    // dump bufferSizes
          blocked = false;
          paused = false;
          port.write(String.fromCharCode(0x18));    // ctrl-x
          break;
        case 'smoothie':
          gcodeQueue.length = 0;        // dump the queye
          grblBufferSize.length = 0;    // dump bufferSizes
          blocked = false;
          paused = false;
          if (data !== 0) {
            port.write(data+"\n"); // Ui sends the Laser Off command to us if configured, so lets turn laser off before unpausing... Probably safer (;
            console.log('STOPPING:  Sending Laser Off Command as ' + data);
          } else {
            port.write("M5\n");  //  Hopefully M5!
            console.log('STOPPING: NO LASER OFF COMMAND CONFIGURED. PLEASE CHECK THAT BEAM IS OFF!  We tried the detault M5!  Configure your settings please!');
          }
          port.write(String.fromCharCode(0x18));    // ctrl-x
          break;
      }
      laserTestOn = false;
      io.sockets.emit("connectStatus", 'stopped:'+port.path);
    } else {
      io.sockets.emit("connectStatus", 'closed');
    }
  });

  socket.on('pause', function(data) {
    if (isConnected) {
      paused = true;
      console.log(chalk.red('PAUSE'));
      switch (firmware) {
        case 'grbl':
          port.write('!');    // Send hold command
          if (fVersion === '1.1d') {
            port.write(String.fromCharCode(0x9E)); // Stop Spindle/Laser
          }
          break;
        case 'smoothie':
          port.write("M600\n"); // Laser will be turned off by smoothie (in default config!)
          break;
      }
      io.sockets.emit("connectStatus", 'paused:'+port.path);
    } else {
      io.sockets.emit("connectStatus", 'closed');
    }
  });

  socket.on('unpause', function(data) {
    if (isConnected) {
      console.log(chalk.red('UNPAUSE'));
      io.sockets.emit("connectStatus", 'unpaused:'+port.path);
      switch (firmware) {
        case 'grbl':
          port.write('~');    // Send resume command
          break;
        case 'smoothie':
          port.write("M601\n");
          break;
      }
      paused = false;
      send1Q(); // restart queue
    } else {
      io.sockets.emit("connectStatus", 'closed');
    }
  });

  socket.on('serialSend', function(data) {
    if (isConnected) {
      data = data.split('\n');
      for (var i=0; i<data.length; i++) {
        var line = data[i].split(';'); // Remove everything after ; = comment
	    var tosend = line[0];
        if (tosend.length > 0) {
          addQ(tosend);
		  send1Q();
        }
      }
    } else {
      io.sockets.emit("connectStatus", 'closed');
    }
  });

  socket.on('feedOverride', function(data) {
    if (isConnected) {
      switch (firmware) {
        case 'grbl':
          var code;
          switch (data) {
            case 0:
              code = 144;	// set to 100%
              data = '100';
              break;
            case 10:
              code = 145;	// +10%
              data = '+' + data;
              break;
            case -10:
              code = 146;	// -10%
              break;
            case 1:
              code = 147;	// +1%
              data = '+' + data;
              break;
            case -1:
              code = 148;	// -1%
              break;
          }
          if (code) {
            //jumpQ(String.fromCharCode(parseInt(code)));
            port.write(String.fromCharCode(parseInt(code)));
            console.log(chalk.red('Override feed: ' + data + '%'));
          }
          break;
        case 'smoothie':
          if (data === 0) {
            feedOverride = 100;
  	      } else {
  	        if ((feedOverride + data <= 200) && (feedOverride + data >= 10)) {
  	          // valid range is 10..200, else ignore!
              feedOverride += data;
     	    }
  	      }
          jumpQ('M220S' + feedOverride);
          io.sockets.emit('feedOverride', feedOverride);
          console.log('Feed Override ' + feedOverride.toString() + '%');
          send1Q();
          break;
      }
    } else {
      io.sockets.emit("connectStatus", 'closed');
    }
  });

  socket.on('spindleOverride', function(data) {
    if (isConnected) {
      switch (firmware) {
        case 'grbl':
          var code;
          switch (data) {
            case 0:
              code = 153;	// set to 100%
              data = '100';
              break;
            case 10:
              code = 154;	// +10%
              data = '+' + data;
              break;
            case -10:
              code = 155;	// -10%
              break;
            case 1:
              code = 156;	// +1%
              data = '+' + data;
              break;
            case -1:
              code = 157;	// -1%
              break;
          }
          if (code) {
            //jumpQ(String.fromCharCode(parseInt(code)));
            port.write(String.fromCharCode(parseInt(code)));
            console.log(chalk.red('Override spindle: ' + data + '%'));
          }
          break;
        case 'smoothie':
          if (data === 0) {
            spindleOverride = 100;
  	      } else {
  	        if ((spindleOverride + data <= 200) && (spindleOverride + data >= 0)) {
  	          // valid range is 0..200, else ignore!
              spindleOverride += data;
  	        }
  	      }
          jumpQ('M221S' + spindleOverride);
          io.sockets.emit('spindleOverride', spindleOverride);
          console.log('Spindle (Laser) Override ' + spindleOverride.toString() + '%');
          send1Q();
          break;
      }
    } else {
      io.sockets.emit("connectStatus", 'closed');
    }
  });

  socket.on('laserTest', function(data) { // Laser Test Fire
    if (isConnected) {
      data = data.split(',');
      var power = parseFloat(data[0]);
      var duration = parseInt(data[1]);
      console.log('laserTest: ', 'Power ' + power + ', Duration ' + duration);
      if (power > 0) {
        if (!laserTestOn) {
          if (duration >= 0) {
            switch (firmware) {
              case 'grbl':
                addQ('M3S' + power);
                laserTestOn = true;
                if (duration > 0) {
                  addQ('G4 P' + duration / 1000);
                  addQ('M5S0');
                  laserTestOn = false;
                }
                send1Q();
                break;
              case 'smoothie':
                port.write('fire ' + power);
                console.log('Fire ' + power);
                laserTestOn = true;
                if (duration > 0) {
                  port.write('G4 P' + duration);
                  console.log('G4 P' + duration);
                  port.write('fire Off');
                  console.log('Fire Off');
                  laserTestOn = false;
                }
                break;
            }
          }
        } else {
          switch (firmware) {
            case 'grbl':
              addQ('M5S0');
              send1Q();
              break;
            case 'smoothie':
              port.write('fire Off');
              console.log('Fire Off');
              break;
          }
          laserTestOn = false;
        }
      }
    } else {
      io.sockets.emit("connectStatus", 'closed');
    }
  });

  socket.on('clearAlarm', function(data) { // Laser Test Fire
    console.log('Clearing Queue: Method ' + data);
    switch (data) {
      case '1':
        console.log('Clearing Lockout');
        switch (firmware) {
          case 'grbl':
            port.write("$X\n");
            break;
          case 'smoothie':
            port.write("M999\n");
            break;
        }
        console.log('Resuming Queue Lockout');
        break;
      case '2':
        console.log('Emptying Queue');
        gcodeQueue.length = 0;        // dump the queye
        grblBufferSize.length = 0;    // dump bufferSizes        
        console.log('Clearing Lockout');
        switch (firmware) {
          case 'grbl':
            port.write("$X\n");
            break;
          case 'smoothie':
            port.write("M999\n");
            break;
        }
        break;
    }
  });


  socket.on('getFirmware', function(data) { // Deliver Firmware to Web-Client
    socket.emit("firmware", firmware);
  });

  socket.on('refreshPorts', function(data) {	// Refresh serial port list
    console.log(chalk.yellow('WARN:'), chalk.blue('Requesting Ports Refresh '));
    serialport.list(function (err, ports) {
      socket.emit("ports", ports);
    });
  });

  socket.on('closePort', function(data) {		// Close serial port and dump queue
    console.log(chalk.yellow('WARN:'), chalk.blue('Closing Port ' + port.path));
    io.sockets.emit("connectStatus", 'closed:'+port.path);
    gcodeQueue.length = 0;	// dump the queye
    grblBufferSize.length = 0;	// dump bufferSizes
    port.close();
    isConnected = false;
    connectedTo = false;
    paused = false;
    blocked = false;
  });

  socket.on('areWeLive', function(data) { 		// Report active serial port to web-client
    socket.emit("activePorts", port.path + ',' + port.options.baudRate);
  });

  socket.on('connectTo', function(data) { // If a user picks a port to connect to, open a Node SerialPort Instance to it
    data = data.split(',');
    console.log(chalk.yellow('WARN:'), chalk.blue('Connecting to Port ' + data));
    if (!isConnected) {
      port = new SerialPort(data[0], {  parser: serialport.parsers.readline("\n"), baudrate: parseInt(data[1]) });
      io.sockets.emit("connectStatus", 'opening:'+port.path);

      port.on('open', function() {
        io.sockets.emit("activePorts", port.path + ',' + port.options.baudRate);
        io.sockets.emit("connectStatus", 'opened:'+port.path);
        // port.write("?");         // Lets check if its Grbl?
        port.write("version\n");    // Lets check if its Smoothieware?
        // port.write("$fb\n");     // Lets check if its TinyG
        // port.write("M115\n");    // Lets check if its Marlin?
        console.log('Connected to ' + port.path + 'at ' + port.options.baudRate);
        isConnected = true;
        connectedTo = port.path;

		// Start intervall for status queries to grbl
		statusLoop = setInterval(function() {
          port.write('?');
        }, 250);

		// Start interval for qCount messages to socket clients
		queueCounter = setInterval(function(){
          io.sockets.emit('qCount', gcodeQueue.length);
        },500);
        io.sockets.emit("activePorts", port.path + ',' + port.options.baudRate);
      });

      port.on('close', function() { // open errors will be emitted as an error event
        clearInterval(queueCounter);
		clearInterval(statusLoop);
        io.sockets.emit("connectStatus", 'closed:'+port.path);
        isConnected = false;
        connectedTo = false;
      });

      port.on('error', function(err) { // open errors will be emitted as an error event
        console.log('Error: ', err.message);
        io.sockets.emit("data", data);
      });

      port.on("data", function (data) {
        console.log('Recv: ' + data);
        if (data.indexOf('Grbl') === 0) {   // Check if it's Grbl
          firmware = 'grbl';
          fVersion = data.substr(5, 4);        // get version
          console.log('GRBL detected (' + fVersion + ')');
        }
        if (data.indexOf('LPC176') >= 0) {	// LPC1768 or LPC1769 should be Smoothie
          firmware = 'smoothie';
          var startPos = data.search(/Version:/i) + 9;
          fVersion = data.substr(startPos).split(/,/, 1);
          console.log('Smoothieware detected (' + fVersion + ')');
        }
        if (data.indexOf("ok") === 0) { // Got an OK so we are clear to send
		  blocked = false;
          if (firmware === 'grbl') {
            grblBufferSize.shift();
          }
          send1Q();
        }
        if (data.indexOf("error") === 0) {
          if (firmware === 'grbl') {
            grblBufferSize.shift();
          }
        }
        io.sockets.emit("data", data);
      });
    } else {
      io.sockets.emit("connectStatus", 'resume:'+port.path);
      // port.write(String.fromCharCode(0x18));    // Lets check if its Grbl?
      port.write("version\n");    // Lets check if its Smoothieware?
      //port.write("$fb\n");        // Lets check if its TinyG
      //port.write("M115\n");       // Lets check if its Marlin?
    }
  });
}
// End Websocket <-> Serial


// Queue
function addQ(gcode) {
  gcodeQueue.push(gcode);
}

function jumpQ(gcode) {
  gcodeQueue.unshift(gcode);
}

function grblBufferSpace() {
  var total = 0;
  for(var i=0,n=grblBufferSize.length; i<n; ++i) {
    total += grblBufferSize[i];
  }
  return GRBL_RX_BUFFER_SIZE - total;
}

function send1Q() {
  switch (firmware) {
    case 'grbl':
      while (gcodeQueue.length > 0 && !blocked && !paused) {
        var gcode = gcodeQueue.shift();
        gcode = gcode.replace(/\s+/g, '');
        var spaceLeft = grblBufferSpace();
        var gcodeLen = gcode.length;
        //console.log('BufferSpace: ' + spaceLeft + ' gcodeLen: ' + gcodeLen);
        if (gcodeLen <= spaceLeft) {
          console.log('Sent: ' + gcode + ' Q: ' + gcodeQueue.length);
          grblBufferSize.push(gcodeLen);
          lastSent = gcode;
          port.write(gcode + '\n');
        } else {
          gcodeQueue.unshift(gcode);
          blocked = true;
        }
      }
      break;
    case 'smoothie':
      if (gcodeQueue.length > 0 && !blocked && !paused) {
        var gcode = gcodeQueue.shift();
        // Optimise gcode by stripping spaces - saves a few bytes of serial bandwidth, and formatting commands vs gcode to upper and lowercase as needed
        gcode = gcode.replace(/\s+/g, '');
        console.log('Sent: '  + gcode + ' Q: ' + gcodeQueue.length);
        lastSent = gcode;
        port.write(gcode + '\n');
        blocked = true;
      }
      break;
  }
}

// Electron app
const electron = require('electron');
// Module to control application life.
const electronApp = electron.app;

if (electronApp) {
    // Module to create native browser window.
    const BrowserWindow = electron.BrowserWindow;

    // Keep a global reference of the window object, if you don't, the window will
    // be closed automatically when the JavaScript object is garbage collected.
    var mainWindow;

    function createWindow() {
        // Create the browser window.
        mainWindow = new BrowserWindow({width: 1200, height: 900, fullscreen: false, center: true, resizable: true, title: "LaserWeb", frame: true, autoHideMenuBar: true, icon: '/public/favicon.png' });

        // and load the index.html of the app.
        mainWindow.loadURL('file://' + __dirname + '/public/index.html');

        // Emitted when the window is closed.
        mainWindow.on('closed', function () {
            // Dereference the window object, usually you would store windows
            // in an array if your app supports multi windows, this is the time
            // when you should delete the corresponding element.
            mainWindow = null;
        });
        mainWindow.once('ready-to-show', () => {
          mainWindow.show()
        })
        mainWindow.maximize()
    };

    electronApp.commandLine.appendSwitch("--ignore-gpu-blacklist");
    // This method will be called when Electron has finished
    // initialization and is ready to create browser windows.
    // Some APIs can only be used after this event occurs.


    electronApp.on('ready', createWindow);

    // Quit when all windows are closed.
    electronApp.on('window-all-closed', function () {
        // On OS X it is common for applications and their menu bar
        // to stay active until the user quits explicitly with Cmd + Q
        if (process.platform !== 'darwin') {
            electronApp.quit();
        }
    });

    electronApp.on('activate', function () {
        // On OS X it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (mainWindow === null) {
            createWindow();
        }
    });
}
