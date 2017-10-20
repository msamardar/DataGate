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
var formidable = require('formidable');
var fs = require('fs');
app.use(express.static('bower_components'));
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(partials());
var dataFiles = [];
var workingFiles = {};
app.get("/", function (req, res) {
    var gapi = require("./gapi");
    res.render("index5", {gapi: gapi});
});
app.post('/upload', function (req, res) {

    // create an incoming form object
    var form = new formidable.IncomingForm();

    // specify that we want to allow the user to upload multiple files in a single request
    form.multiples = true;

    // store all uploads in the /uploads directory
    form.uploadDir = __dirname + '/data_uploads';

    // every time a file has been uploaded successfully,
    // rename it to it's orignal name
    form.on('file', function (field, file) {
        fs.rename(file.path, __dirname + '/data_uploads/' + file.name);
    });

    // log any errors that occur
    form.on('error', function (err) {
        console.log('An error has occured: \n' + err);
    });

    // once all the files have been uploaded, send a response to the client
    form.on('end', function () {
        res.end('success');
    });

    // parse the incoming request containing the form data
    form.parse(req);

});
app.use(fileUpload());
app.post("/validate", function (req, res) {
    req.files = {data: {}};
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
    var validate = require("./validate2.js");
    validate.setGDrive(req.body.token);
    validate.uploadSpecFile(req.files.spec, function (err, specFilePath) {
        if (err) {
            console.log('uploadSpecFile err=' + err);
            res.status(400).json(err);
        } else {
            //console.log('validator=' + specFilePath);
            validate.getValidator(specFilePath, function (err, validator) {
                if (err) {
                    console.log('getValidator err=' + err);
                    res.status(400).json(err);
                } else {
                    var dirname = './data_uploads/';
                    fs.readdir(dirname, function (err, filenames) {
                        if (err) {
                            console.log('readdir err=' + err);
                            res.status(400).json(err);
                        } else {
                            var fileCounter = filenames.length;
                            var finished = false;
                            var counter = 0;
                            var reports = [];
                            var allReports = [];

                            filenames.forEach(function (filename) {
                                counter++;
                                validate.fetchCSV(dirname + filename, function (err, csv) {
                                    //console.log('Processing file:' + dirname + filename);
                                    if (err) {
                                        console.log('fetchCSV err=' + err);
                                        res.status(400).json(err);
                                    } else {
                                        validate.validateDataFile(filename, csv, validator, function (err, validated_data) {
                                            if (err) {
                                                console.log('validateDataFile err=' + err);
                                                res.status(400).json(err);
                                            } else {
                                                //var pieces = files.data.split('/');
                                                //pieces = pieces[pieces.length - 1].split(".");
                                                var pieces = filename.split(".");
                                                var filenameWithoutExt = pieces.slice(0, -1).join('.');
                                                var dir = "processed_files/";
                                                var good_file = dir + filenameWithoutExt + "_good.csv";
                                                var bad_file = dir + filenameWithoutExt + "_bad.csv";
                                                var report = dir + filenameWithoutExt + "_report.csv";
                                                var schema = dir + filenameWithoutExt + "_schema.json";
                                                var allReportFileName = dir + 'AllData' + "_report.csv";
                                                var gdrive = [];
                                                if (req.body.destination == "gdrive") {
                                                    validate.gDriveMakeFolder({
                                                        folder_id: req.body.dest,
                                                        //name: req.files.data.name.split(".").slice(0, -1).join(".")
                                                        name: filenameWithoutExt
                                                    }, function (err, dest_folder) {
                                                        if (err) {
                                                            console.log('dest_folder err=' + err);
                                                            res.status(400).json(err);
                                                        } else {
                                                            gdrive.bad = {
                                                                path: bad_file,
                                                                gdrive: true,
                                                                folder_id: dest_folder.id,
                                                                name: filenameWithoutExt + "_bad.csv"
                                                            }
                                                            gdrive.good = {
                                                                path: good_file,
                                                                gdrive: true,
                                                                folder_id: dest_folder.id,
                                                                name: filenameWithoutExt + "_good.csv"
                                                            }
                                                            gdrive.report = {
                                                                folder_id: dest_folder.id,
                                                                mail: true,
                                                                gdrive: true,
                                                                path: report,
                                                                name: filenameWithoutExt + "_report.csv"
                                                            }
                                                            gdrive.schema = {
                                                                folder_id: dest_folder.id,
                                                                gdrive: true,
                                                                path: schema,
                                                                name: filenameWithoutExt + "_schema.json"
                                                            };
                                                            var driveInfo = {
                                                                gdrive_testName: filenameWithoutExt,
                                                                gdrive_folderId: dest_folder.id,
                                                                gdrive_bad: gdrive.bad,
                                                                gdrive_good: gdrive.good,
                                                                gdrive_report: gdrive.report,
                                                                gdrive_schema: gdrive.schema
                                                            };
                                                            reports.push(driveInfo);
                                                            allReports.push(validated_data.report);
                                                            validate.writeToFile(validated_data.bad, bad_file, gdrive.bad, function (err, data) {
                                                                if (err) {
                                                                    console.log('writeToFile bad err=' + err);
                                                                    res.status(400).json(err);
                                                                } else {
                                                                    validate.writeToFile(validated_data.good, good_file, gdrive.good, function (err, data) {
                                                                        if (err) {
                                                                            console.log('writeToFile good err=' + err);
                                                                            res.status(400).json(err);
                                                                        } else {
                                                                            validate.writeJsonToFile(validator.schema, schema, gdrive.schema, function (err, data) {
                                                                                if (err) {
                                                                                    console.log('writeJsonToFile err=' + err);
                                                                                    res.status(400).json(err);
                                                                                } else {
                                                                                    //console.log(data);
                                                                                    validate.writeToFile(validated_data.report, report,
                                                                                        gdrive.report, function (err, data) {
                                                                                            if (err) {
                                                                                                console.log('writeToFile report err=' + err);
                                                                                                res.status(400).json(err);
                                                                                            } else {
                                                                                                if ((fileCounter == counter) && (!finished)) {
                                                                                                    finished = true;
                                                                                                    validate.writeAllReportsFile(allReports,
                                                                                                        allReportFileName, function (err, data) {
                                                                                                            if (err) {
                                                                                                                console.log('writeToFile report err=' + err);
                                                                                                                res.status(400).json(err);
                                                                                                            }
                                                                                                            else {
                                                                                                                console.log("Done");
                                                                                                                try {
                                                                                                                    //console.log('allReports=' + allReports);
                                                                                                                    res.json({
                                                                                                                        status: true,
                                                                                                                        reports: reports
                                                                                                                        //view_url: "https://drive.google.com/drive/folders/" + dest_folder.id
                                                                                                                    });


                                                                                                                }
                                                                                                                catch (err) {
                                                                                                                    console.log("Err in res.json:" + err);
                                                                                                                }
                                                                                                            }
                                                                                                        });
                                                                                                }

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
                                            }
                                        });
                                    }
                                });

                            });
                        }
                    });

                }

            });

        }
    });

});


app.post("/getAllReportData", function (req, res) {
    var allReportDataFile = 'AllData_report.csv';
    var CSV = require("fast-csv");
    var fs = require("fs");
    var stream = fs.createReadStream("./processed_files/" + allReportDataFile);
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

app.post("/getReportData", function (req, res) {
    var CSV = require("fast-csv");
    var fs = require("fs");
    var stream = fs.createReadStream("./processed_files/" + req.body.report_id + "_report.csv");
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


app.listen(process.env.PORT || 3000, function () {
    console.log("Server is running...");
});


module.exports = app;