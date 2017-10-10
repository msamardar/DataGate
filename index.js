var express = require("express");
var partials = require('express-partials');
var fileUpload = require('express-fileupload');
var bodyParser = require('body-parser');
var cfg = require("./config.js");
var async = require('async');
const JSFtp = require("jsftp");
const promise = require('bluebird');
var env = require('dotenv').config();
var app = express();

app.use(express.static('bower_components'));
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json())
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(partials());
app.use(fileUpload());

app.get("/", function (req, res) {
    var gapi = require("./gapi");
    res.render("index", {gapi: gapi});
});

app.post("/validate", function (req, res) {
    var error = {};
    if (req.body.data_file == "local" && !req.files.data) {
        error.data = "Data file is required";
    }
    if (req.body.spec_file == "new" && !req.files.spec) {
        error.spec = "Specs file is required.";
    }
    if (req.body.spec_file == "gdrive" && !req.body.spec) {
        error.spec = "Specs file is required.";
    } else {
        req.files.spec = {name: "spec.xls", data: req.body.spec, type: "gdrive"};
    }
    if (req.body.destination == "gdrive" && !req.body.dest) {
        error.dest = "Destination Path is required.";
    }
    var respnse = {};
    if (Object.keys(error).length > 0) {
        respnse.status = false;
        respnse.error = error;
        return res.json(respnse);
    }
    var validate = require("./validate.js");
    validate.setGDrive(req.body.token);
    validate.uploadFiles(req.files, function (err, files) {
        if (err) {
            res.status(400).json(err);
        } else {
            validate.getValidator(files.spec, function (err, validator) {
                if (err) {
                    res.status(400).json(err);
                } else {
                    validate.fetchCSV(files.data, function (err, csv) {
                        if (err) {
                            res.status(400).json(err);
                        } else {
                            validate.validateDataFile(req.files.data.name, csv, validator, function (err, validated_data) {
                                var pieces = files.data.split('/');
                                pieces = pieces[pieces.length - 1].split(".");
                                var filenameWithoutExt = pieces.slice(0, -1).join('.');
                                var dir = "files/";
                                var good_file = dir + filenameWithoutExt + "_good.csv";
                                var bad_file = dir + filenameWithoutExt + "_bad.csv";
                                var report = dir + filenameWithoutExt + "_report.csv";
                                var schema = dir + filenameWithoutExt + "_schema.json";
                                var gdrive = [];
                                if (req.body.destination == "gdrive") {
                                    validate.gDriveMakeFolder({
                                        folder_id: req.body.dest,
                                        name: req.files.data.name.split(".").slice(0, -1).join(".")
                                    }, function (err, dest_folder) {
                                        if (err) {
                                            res.status(400).json(err);
                                        } else {
                                            gdrive.bad = {
                                                path: bad_file,
                                                gdrive: true,
                                                folder_id: dest_folder.id,
                                                name: req.files.data.name.split(".").slice(0, -1).join(".") + "_bad.csv"
                                            }
                                            gdrive.good = {
                                                path: good_file,
                                                gdrive: true,
                                                folder_id: dest_folder.id,
                                                name: req.files.data.name.split(".").slice(0, -1).join(".") + "_good.csv"
                                            }
                                            gdrive.report = {
                                                folder_id: dest_folder.id,
                                                mail: true,
                                                gdrive: true,
                                                path: report,
                                                name: req.files.data.name.split(".").slice(0, -1).join(".") + "_report.csv"
                                            }
                                            gdrive.schema = {
                                                folder_id: dest_folder.id,
                                                gdrive: true,
                                                path: schema,
                                                name: req.files.data.name.split(".").slice(0, -1).join(".") + "_schema.json"
                                            }
                                            validate.writeToFile(validated_data.bad, bad_file, gdrive.bad, function (err, data) {
                                                if (err) {
                                                    res.status(400).json(err);
                                                } else {
                                                    validate.writeToFile(validated_data.good, good_file, gdrive.good, function (err, data) {
                                                        if (err) {
                                                            res.status(400).json(err);
                                                        } else {
                                                            validate.writeJsonToFile(validator.schema, schema, gdrive.schema, function (err, data) {
                                                                if (err) {
                                                                    res.status(400).json(err);
                                                                } else {
                                                                    validate.writeToFile(validated_data.report, report, gdrive.report, function (err, data) {
                                                                        if (err) {
                                                                            res.status(400).json(err);
                                                                        } else {
                                                                            res.json({
                                                                                status: true,
                                                                                report_id: filenameWithoutExt,
                                                                                view_url: "https://drive.google.com/drive/folders/" + dest_folder.id
                                                                            });
                                                                        }
                                                                    })
                                                                }
                                                            })
                                                        }
                                                    })
                                                }
                                            })
                                        }

                                    })

                                }
                            })
                        }
                    });
                }
            });
        }
    });
});

app.post("/getReportData", function (req, res) {
    var CSV = require("fast-csv");
    var fs = require("fs");
    var stream = fs.createReadStream("./files/" + req.body.report_id + "_report.csv");
    var data = [];
    CSV.fromStream(stream, {headers: true, rtrim: true, ltrim: true})
        .on("data", function (row) {
            data.push(row);
        })
        .on("end", function () {
            res.json({status: true, data: data});
        })
        .on("error", function (err) {
            res.status(400).json(err);
        })

});
let google = require('googleapis');
let authentication = require("./authentication");

app.get("/validate-ftp-files", function (req, res) {
    var filename = req.query.filename;
    authentication.authenticate().then((auth) => {
        var jsonSchema = {};
        var sheets = google.sheets('v4');
        sheets.spreadsheets.values.get({
            auth: auth,
            spreadsheetId: cfg.SheetId,
            range: 'A:L', //Change Sheet1 if your worksheet's name is something else
        }, (err, response) => {
            if (err) {
                console.log('The API returned an error: ' + err);
                return;
            }
            var rows = response.values;
            if (rows.length === 0) {
                console.log('No data found.');
            } else {
                var property = {};
                var require = [];
                var dependencies = {};
                dependencies['dependencies'] = {};
                for (var i = 1; i < rows.length; i++) {
                    var row = rows[i];
                    var propertiesName = row[0];
                    var format = row[7];
                    var typeObject = {};
                    if (format == "Text") {
                        typeObject['type'] = 'string';
                    }
                    else if (format == "List") {
                        typeObject['type'] = 'string';
                    }
                    else if (format == "Number") {
                        typeObject['type'] = 'number';
                    }
                    else if (format == "Timestamp") {
                        //typeObject['format'] = 'date-time';
                    }
                    property[propertiesName] = typeObject;
                    var required = row[6];
                    if (required == 'Yes') {
                        require.push(row[0]);
                    }

                    try {
                        var values = JSON.parse(row[8]);
                        var keys = Object.keys(values);

                        for (var j = 0; j < (keys.length); j++) {
                            if (keys[j] === 'conditional') {
                                var applyConditionOn = values[keys[j]][0]['condition'].split('=')[0];
                                var applyCondition = values[keys[j]][0]['condition'].split('=')[1];
                                applyConditionOn = applyConditionOn.trim().toUpperCase();
                                applyCondition = applyCondition.trim();
                                if (applyConditionOn === 'PROJECT') {
                                    var dependencyOf = {};
                                    var p = {};
                                    var obj = {};
                                    var regex = {};
                                    regex['pattern'] = '^[0-9]{3}-[0-9]{2}185-2[0-9]{3}-[0-9]{3}$';
                                    // enumm['enum'] = [];
                                    // enumm['enum'].push(applyCondition);
                                    obj['NVPN'] = regex;
                                    p['properties'] = obj;
                                    dependencies['dependencies'][propertiesName] = p;
                                }
                                else {
                                    var dependencyOf = {};
                                    var p = {};
                                    var obj = {};
                                    var enumm = {};
                                    enumm['enum'] = [];
                                    enumm['enum'].push(applyCondition);
                                    obj[applyConditionOn] = enumm;
                                    p['properties'] = obj;
                                    dependencies['dependencies'][propertiesName] = p;
                                }
                                if (values[keys[j]][0]['enum']) {
                                    if (values[keys[j]][0]['enum'].length > 0) {
                                        uniqueArray = values[keys[j]][0]['enum'].filter(function (elem, pos) {
                                            return values[keys[j]][0]['enum'].indexOf(elem) == pos;
                                        });
                                        property[propertiesName]['enum'] = uniqueArray;
                                    }
                                    /*else
                                    {
                                      console.log("zero length");
                                    }*/
                                }
                            }
                            else if (keys[j] === 'enum') {
                                if (values[keys[j]].length > 0) {
                                    uniqueArray = values[keys[j]].filter(function (elem, pos) {
                                        return values[keys[j]].indexOf(elem) == pos;
                                    });
                                    property[propertiesName]['enum'] = uniqueArray;
                                }
                            }
                            else if (keys[j] === 'length') {
                                property[propertiesName]['maxLength'] = values[keys[j]];
                                property[propertiesName]['minLength'] = values[keys[j]];
                            }
                            else if (keys[j] === 'format') {
                                if (values[keys[j]] == "RC*") {
                                    property[propertiesName]['pattern'] = '^RC *';
                                }
                                else if (values[keys[j]] == "yyyy-MM-dd hh24:mm:sssZZ") {
                                    property[propertiesName]['pattern'] = '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{1,2}[+|:][0-9]{1,4}$';
                                }
                                else if (values[keys[j]] == "ddd-ddddd-dddd-ddd") {
                                    property[propertiesName]['pattern'] = '^[0-9]{3}-[0-9]{5}-[0-9]{4}-[0-9]{3}$';
                                }
                            }
                        }
                    }
                    catch (err) {
                        if (row[8] == "") {
                            console.log("Perhaps format validation column of '" + propertiesName + "'' is not a valid json OR empty. Value of column: " + "empty");
                        }
                        else {
                            console.log("Perhaps format validation column of '" + propertiesName + "'' is not a valid json OR empty. Value of column:", row[8]);
                        }
                    }
                }
                jsonSchema.properties = property;

                if (require.length > 0) {
                    jsonSchema.required = require;
                }
                jsonSchema.dependencies = dependencies['dependencies'];
                var ajv = new Ajv(); // options can be passed, e.g. {allErrors: true}
                try {
                    var validate = ajv.compile(jsonSchema);
                    console.log("JSON Schema:");
                    console.log(JSON.stringify(jsonSchema, null, 4));
                    // console.log("jsonSchema: ", jsonSchema);
                }
                catch (err) {
                    console.log(err);
                    res.json({success: false, message: 'invalid schema. Schema Contains Errors.'});
                    return;
                }
                ftp = new JSFtp({
                    host: cfg.ftpHost,
                    port: cfg.ftpPort,
                    user: cfg.ftpUser, // defaults to "anonymous"
                    pass: cfg.ftpPass // defaults to "@anonymous"
                });
                ftp = promise.promisifyAll(ftp);
                var local = __dirname + '/files/';
                var remote = cfg.remoteFilePath;
                /*ftp.raw("dele", "ajv/test.csv", function(err, data) {
                    if (err) return console.error(err);

                    // console.log(data.text); // Show the FTP response text to the user
                    console.log(data); // Show the FTP response code to the user
                });
                res.json({success: true});*/
                var gatherFiles = function (dir) {
                    return new Promise(function (resolve, reject) {
                        ftp.ls(dir + '/*', function (err, res) {
                            if (err) reject(err)
                            //console.log(res)
                            var files = [];
                            res.forEach(function (file) {
                                files.push(file.name)
                            });
                            resolve(files);
                        })
                    })
                }
                gatherFiles(remote).then(function (files) {
                    //console.log(files)
                    async.mapLimit(files, 1, function (file, callback) {
                        //console.log('attempting: ' +remote +'/'+ file + '->' + local + file)
                        ftp.get(remote + '/' + file, local + '/' + file, function (err) {
                            if (err) {
                                console.log('Error getting ' + file)
                                callback(err);
                            } else {
                                //console.log('Got ' + file)
                                //processThisFile(file).then(function(){
                                var filenameWithoutExt = file.substr(0, file.lastIndexOf('.'));
                                var stream = fs.createReadStream(__dirname + "/files/" + file);
                                var csvGoodStream = csv.createWriteStream({headers: true}),
                                    csvBadStream = csv.createWriteStream({headers: true}),
                                    writableGoodStream = fs.createWriteStream(__dirname + "/files/" + filenameWithoutExt + "_clean.csv"),
                                    writableBadStream = fs.createWriteStream(__dirname + "/files/" + filenameWithoutExt + "_dirty.csv");

                                writableGoodStream.on("finish", function () {
                                    console.log("Clean file '" + filenameWithoutExt + "_clean.csv' writing DONE!");
                                });

                                writableBadStream.on("finish", function () {
                                    console.log("Dirty file '" + filenameWithoutExt + "_dirty.csv' writing DONE!");
                                });
                                csvGoodStream.pipe(writableGoodStream);
                                csvBadStream.pipe(writableBadStream);

                                csv
                                    .fromStream(stream, {headers: true, rtrim: true, ltrim: true})
                                    .on("data", function (data) {
                                        // console.log(data);
                                        if (data['RSTATIONID']) {
                                            data['RSTATIONID'] = Number(data['RSTATIONID']);
                                        }
                                        if (data['NV Bug']) {
                                            data['NV Bug'] = Number(data['NV Bug']);
                                        }
                                        //console.log(data);
                                        var valid = validate(data);
                                        if (!valid) {
                                            console.log("Error in a row:", validate.errors);
                                            csvBadStream.write(data);
                                        }
                                        else if (valid) {
                                            csvGoodStream.write(data);
                                        }
                                    })
                                    .on("end", function () {
                                        csvGoodStream.end();
                                        csvBadStream.end();
                                        let remoteCleanFile = cfg.remoteFilePath + '/' + filenameWithoutExt + '_clean.csv'
                                        let localCleanFile = __dirname + '/files/' + filenameWithoutExt + '_clean.csv';

                                        ftp.putAsync(localCleanFile, remoteCleanFile)
                                            .then(() => {
                                                let remoteDirtyFile = cfg.remoteFilePath + '/' + filenameWithoutExt + '_dirty.csv'
                                                let localDirtyFile = __dirname + '/files/' + filenameWithoutExt + '_dirty.csv';
                                                ftp.putAsync(localDirtyFile, remoteDirtyFile).then(() => {
                                                    callback();
                                                })

                                            });

                                    });

                                //})

                            }

                        })
                    }, function (err, res) {
                        if (err) {
                            console.log(err)
                        }
                        console.log('All Done!!!');
                    })
                })
                res.json({success: true, message: 'Done with files on ftp'});
            }
        })
    });

});

app.listen(process.env.PORT || 3000, function () {
    console.log("My API is running...");
});


module.exports = app;