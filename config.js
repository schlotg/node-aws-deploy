// handle all the config loading, updating, and saving
var fs = require ("fs");
var config_file, config;
var path = require.resolve ("./config.js").replace ("config.js", "");
var configPath =  path + ".app-config.json";
try {config_file = fs.readFileSync (configPath);}
catch (e){}


// remove non-standard quotation marks and replace them with the standard ones
function conditionString (str){
    var open = String.fromCharCode(147);
    var close = String.fromCharCode(148);
    return str && str.replace(open,'"').replace(close,'"');
}

if (config_file){
    try {config = JSON.parse (conditionString(config_file.toString ()));}
    catch (err){ error = err;}
}

if (!config) {
    console.log ("\t'.app-config.json' is missing or invalid: Error:" + error);
    console.log ("\tContinuing on with defaults");
    config = {};
}

// create the config object
function createConfig (){
    var _interface = {
        // give access to the data
        data:config,
        path:path,
        conditionString: conditionString,
        // update it
        update: function (){
            if (config){
                var saveData =  config.data || config;
                var data = JSON.stringify (saveData, null, 4);
                fs.writeFileSync (configPath, conditionString (data));
            }
        }
    };
     return _interface;
}

var configObj = createConfig ();
for (var func in configObj){
    exports[func] = configObj[func];
}