/*
 *  Libraries
 */
var http                      = require('http');
var jsdom                     = require('jsdom');
var d3                        = require('d3');
var _                         = require('lodash');
var xmlserializer             = require('xmlserializer');

/*
 *  Environment variables
 */
var mainPort = process.env.PORT || 3000;
var domain = process.env.DOMAIN || 'mainstream.ninja';
console.info(mainPort);


var localData = {};

function responseHandler(res, status, body){
  if(status) {
    res.statusCode = status;
  }
  if(body){
    res.write(status + ' ' + body+'\n');
  }
  res.end();
}

function addLocalData(timeout){
  if(!localData[timeout]){
    localData[timeout] = [];
  }
  localData[timeout].push(Date.now());
  console.log(localData);
}


function delayedResponse(req, res) {
  /*
   *  I know 200 is the html status code for OK, so that's implied, but no curl commands were specified so I am adding them, as text as well.
   */
  var respText = "OK\n"
  var substr = req.url.substring(req.url.lastIndexOf('/')+1);
  try {
    if(!isNaN(substr)) {
      var timeout = Number(substr);
      console.log(timeout);
      console.log(timeout < 0);
      if(timeout < 0 ){
        responseHandler(res, 400, 'BAD REQUEST');
        return;
      }
      var total = parseInt(timeout/29);
      var count = 0
      if(total > 0) {
        var poll = setInterval(function(){
          res.write('');
          count++;
          if(count == total) {
            setTimeout(function() {
              clearTimeout(poll);
              responseHandler(res, 200, 'OK');
              addLocalData(timeout);
            }, (timeout % 29) * 1000);
          }
        }, 29000)  
      } else {
        setTimeout(function() {
          responseHandler(res, 200, 'OK');
          addLocalData(timeout);
        }, timeout*1000);
      }
    } else {
      responseHandler(res, 400, 'BAD REQUEST');
    }
  } catch (e){
    console.log(e);
    responseHandler(res, 400, 'BAD REQUEST');
  }
}

/*
 * Api subdomain functions
 */
function callApi(req, res) {
  if(/^\/delay\/\d+(\.\d+)?$/.test(req.url)){
    console.log("regex Passed");
    delayedResponse(req, res);
  } else {
    responseHandler(res, 400, 'BAD REQUEST');
  }
}

/*
 * Admin subdomain functions
 */
function callAdmin(req, res) {
  var authHeader = req.headers['authorization'];
  if(!!authHeader) {
    //Remove Basic
    var encryptedAuth = authHeader.split(' ');
    
    //Created base64 buffer, filled t
    var authBuffer = encryptedAuth.length == 2 ? new Buffer(encryptedAuth[1], 'base64') : undefined; 

    if(!!authBuffer) {

      var plainAuth = authBuffer.toString();
      var authFields = plainAuth.split(':');

      if(authFields[0] == 'username' && authFields[1] == 'password') {
        if(!/^\/delay\/\d+(\.\d+)?$/.test(req.url)) {
          responseHandler(res, 400, 'BAD REQUEST');
          return;
        } 
        var xBreak = new Date();
        var delayTime = req.url.substring(req.url.lastIndexOf('/')+1);
        var count = 0;

        xBreak.setDate(xBreak.getDate() - 7);

        var delayData = _.chain(localData[Number(delayTime)]).filter(function(requestTime){
          return requestTime > xBreak; 
        })
        .sort()
        .map(function(element){
          return {
            'y' : ++count,
            'x' : element
          }
        }).value();
        delayData.push({
          'y' : count,
          'x' : Date.now()
        })
        console.log(delayData);
        drawChart(delayData, res);
        return; 
      }
    }
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"');
  responseHandler(res, 401, 'UNAUTHORIZED');

}

function drawChart(data, res){
  var width   = 900;
  var height  = 500;

  jsdom.env({
    html:'',
    features:{ QuerySelector:true, XMLSerializer:true}, //you need query selector for D3 to work
    done:function(errors, window){
      window.d3 = d3.select(window.document);
      var svg = window.d3.select('body')
      .append('div').attr('class','container') //make a container div to ease the saving process
      .append('svg')
      .attr({
        xmlns: 'http://www.w3.org/2000/svg',
        width: width,
        height: height
      }).style({
        padding: "30px 30px 50px 30px"
      })
      .append('g')

      var x = d3.time.scale().range([0, 900]);
      var y = d3.scale.linear().range([500, 0]);
      var xAxis = d3.svg.axis().scale(x)
          .orient("bottom").ticks(5);

      var yAxis = d3.svg.axis().scale(y)
          .orient("right").ticks(5);

      var valueline = d3.svg.line()
          .x(function(d) { return x(d.x); })
          .y(function(d) { return y(d.y); });

      x.domain(
        [
          d3.min(data, function(d) {
            return d.x; 
          }),
          Date.now()
        ]
      );
      y.domain(
        [
           d3.min(data, function(d) {
             return d.y; }),
           d3.max(data, function(d) {
             return d.y;
           })
        ]
      );
      svg.append("path")
        .attr("id", "line")
        .attr("d", valueline(data))
        .style({
          "fill": "none",
          "stroke": "#226699",
          "stroke-width": "2"
        });

      svg.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + 500 + ")")
        .style({
          "fill": "none",
          "stroke": "grey",
          "stroke-width": "2"
        })
        .call(xAxis)

      svg.append("g")
        .attr("class", "y axis")
        .style({
          "fill": "none",
          "stroke": "grey",
          "stroke-width": "2"
        })
        .call(yAxis);

      var serialised = xmlserializer.serializeToString(window.document);

      res.writeHeader(200, {"Content-Type": "text/html"}); 
      res.write(serialised);
      res.end();
    }
  })
}

console.log(domain);
/*
 * Starts a http and listens for requests on mainPort
 */
var mainServer = http.createServer(function(req, res) {

  var hostname = req.headers.host.split(":")[0];
  console.log('Request Received')
  console.log(req.headers.host);
  // Routing logic
  switch(hostname){
    case 'api.' + domain:
      callApi(req, res);
      return;
    case 'admin.' + domain:
      callAdmin(req, res);
      return;
    default:
      responseHandler(res, 404, 'NOT FOUND')
      return;
  }

}).on('error', function(err){
    console.log(err);
}).listen(mainPort, function(err) {
  if (err) {
    console.error(err)
  } else {
    console.info("==>  Listening on port %s.", mainPort)
  }
});

// proxy.web(req, res, options, function(err){
//   console.log("Proxy Error: ", err);
// });
