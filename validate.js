var Excel = require('exceljs');
var Ajv = require('ajv');
var ajv = new Ajv({allErrors: true, jsonPointers: true, errorDataPath: 'property'});
var CSV = require("fast-csv");
var fs = require("fs");
var google = require('googleapis');
var gapi = require("./gapi.js");
var moment = require('moment');
const nodemailer = require('nodemailer');
var sgTransport = require('nodemailer-sendgrid-transport');

var drive;

module.exports = {
    setGDrive: function (token) {
        var OAuth2 = google.auth.OAuth2;
        var oauth2Client = new OAuth2(
            gapi.CLIENT_ID,
            gapi.CLIENT_SECRET,
            gapi.REDIRECT_URL
        );
        oauth2Client.setCredentials({access_token: token});
        drive = google.drive({
            version: 'v3',
            auth: oauth2Client
        });
    },

    getValidator: function (filepath, callback) {
        var workbook = new Excel.Workbook();
        workbook.xlsx.readFile(filepath).then(function () {
            var worksheet = workbook.getWorksheet(1);
            if (worksheet.actualRowCount == 0) {
                callback({msg: "No data found is specs file"});
            } else {
                var jsonSchema = {};
                var property = {};
                var require = [];
                var dependencies = {};
                dependencies['dependencies'] = {};
                for (var i = 2; i <= worksheet.actualRowCount; i++) {
                    var row = worksheet.getRow(i).values;
                    var propertiesName = row[1];
                    var format = row[8];
                    var typeObject = {};
                    if (format == "Text") {
                        typeObject['type'] = 'string';
                    }
                    else if (format == "List") {
                        typeObject['type'] = 'string';
                    }
                    else if (format == "Number") {
                        typeObject['type'] = 'number';
                    } else if (format == "Timestamp") {
                        typeObject['type'] = 'string';
                    }
                    else if (format == "pattern") {
                        typeObject['type'] = 'string';
                    }
                    property[propertiesName] = typeObject;
                    var required = row[7];
                    if (required == 'Yes') {
                        require.push(row[1]);
                    }
                    try {
                        var values = JSON.parse(row[9]);
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
                                    regex['pattern'] = '^[0-9]{3}-[0-9]{1}' + applyCondition + '-[0-9]{4}-[0-9]{3}$';
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
                                    property[propertiesName]['pattern'] = '^RC.{0,}';
                                } else if (values[keys[j]] == "*") {
                                    property[propertiesName]['pattern'] = '^.{0,}';
                                } else if (values[keys[j]] == "yyyy-MM-dd hh24:mm:sssZZ") {
                                    property[propertiesName]['pattern'] = '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{1,2}[+|:][0-9]{1,4}$';
                                } else if (values[keys[j]] == "yyyy-MM-dd hh24:mm") {
                                    property[propertiesName]['pattern'] = '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4} [0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2} ([AaPp][Mm])$';
                                } else if (values[keys[j]] == "ddd-ddddd-dddd-ddd") {
                                    property[propertiesName]['pattern'] = '^[0-9]{3}-[0-9]{5}-[0-9]{4}-[0-9]{3}$';
                                } else if (values[keys[j]] == "dd.dd.dd.dd.dd") {
                                    property[propertiesName]['pattern'] = '^[0-9a-zA-Z]{2}.[0-9a-zA-Z]{2}.[0-9a-zA-Z]{2}.[0-9a-zA-Z]{2}.[0-9a-zA-Z]{2}$';
                                } else if (values[keys[j]] == "[A-Z]dddd-[A-Z]dd-[A-Z]dddd") {
                                    property[propertiesName]['pattern'] = '^[A-Z][0-9]{4}-[A-Z][0-9]{2}-[A-Z][0-9]{4}$';
                                }
                            } else if (keys[j] === 'regex') {
                                property[propertiesName]['pattern'] = values[keys[j]];
                            }
                        }
                    }
                    catch (err) {
                        if (row[9] == "") {
                            console.log("Perhaps format validation column of '" + propertiesName + "' is not a valid json OR empty. Value of column: " + row[9]);
                        }
                        else {
                            console.log("Perhaps format validation column of '" + propertiesName + "' is not a valid json OR empty. Value of column:" + row[9]);
                        }
                    }
                }

                jsonSchema.properties = property;
                if (require.length > 0) {
                    jsonSchema.required = require;
                }
                jsonSchema.dependencies = dependencies['dependencies'];
                try {
                    var validate = ajv.compile(jsonSchema);
                    // console.log(validate.schema)
                    callback(null, validate)
                }
                catch (err) {
                    callback({msg: "invalid schema. Schema Contains Errors."});
                }
            }
        });
    },

    uploadFiles: function (files, callback) {
        var file_names = {};
        var counter = 0;
        var error = false;
        Object.keys(files).forEach(function (key) {
            var file = files[key];
            var ext = file.name.split('.');
            ext = ext[ext.length - 1];
            file_names[key] = "/tmp/" + Date.now() + "." + ext;
            if (file.type && file.type == "gdrive") {
                var params1 = {
                        fileId: file.data,
                        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    },
                    params2 = {encoding: null};
                drive.files.export(params1, params2, function (err, resp) {
                    if (err) {
                        error = err;
                        console.log(err);
                        callback(err);
                    } else {
                        fs.writeFile(file_names[key], resp, function (err) {
                            counter++;
                            if (err) {
                                error = err;
                                console.log(err);
                                callback(err);
                            } else {
                                if (Object.keys(files).length == counter) {
                                    callback(null, file_names);
                                }
                            }
                        });
                    }
                });
            } else {
                file.mv(file_names[key], function (err) {
                    counter++;
                    if (err) {
                        error = err;
                        console.log(err);
                        callback(err);
                    } else {
                        if (Object.keys(files).length == counter) {
                            callback(null, file_names);
                        }
                    }
                });
            }
        });
    },

    fetchCSV: function (filename, callback) {
        var stream = fs.createReadStream(filename);
        var file_data = [];
        CSV.fromStream(stream, {headers: true, rtrim: true, ltrim: true})
            .on("data", function (data) {
                if (data['RSTATIONID']) {
                    data['RSTATIONID'] = Number(data['RSTATIONID']);
                }
                if (data['NV Bug']) {
                    data['NV Bug'] = Number(data['NV Bug']);
                }
                file_data.push(data);
            })
            .on("end", function () {
                callback(null, file_data);
            });
    },

    validateDataFile: function (filename, csv, validator, callback) {
        var valid_data = [];
        var invalid_data = [];
        var report = [];
        var counter = 0;
        csv.forEach(function (row) {
            var valid = validator(row);
            if (!valid) {
                for (i = validator.errors.length - 1; i >= 0; i--) {
                    let error = validator.errors[i];
                    report.push({
                        FileName: filename,
                        LineNumber: counter + 2,
                        ViolationType: error.keyword,
                        ViolatedFiled: error.dataPath.substr(1),
                        ViolatedMessage: error.message,
                        ViolatedData: row[error.dataPath.substr(1)],
                        errorDetail: JSON.stringify(error.params),
                        errorPath: error.schemaPath.substr(1).split("%20").join(" ")
                    });
                }
                invalid_data.push(row);
            }
            else if (valid) {
                valid_data.push(row);
            }
            counter++;
            if (counter == csv.length) {
                callback(null, {good: valid_data, bad: invalid_data, report: report});
                // console.log(report);
            }
        });
    },

    writeToFile: function (data, path, gdrive, callback) {
        var iam = this;
        let csv_stream = CSV.createWriteStream({headers: true});
        let fs_stream = fs.createWriteStream(path);
        csv_stream.pipe(fs_stream);
        var counter = 0;
        if (0 == data.length) {
            csv_stream.end();
        }
        data.forEach(function (row) {
            csv_stream.write(row);
            counter++;
            if (counter == data.length) {
                csv_stream.end();
            }
        })
        fs_stream.on("error", function (err) {
            console.log("path :" + path);
            console.log("error :" + err)
        });
        fs_stream.on("finish", function () {
            if (gdrive.mail) {
                var options = {
                    auth: {
                        api_key: gapi.SENDGRID_API_KEY
                    }
                }

                var mailer = nodemailer.createTransport(sgTransport(options));

                let mailOptions = {
                    from: '"File Validation " <jsonvalidation@gmail.com>', // sender address
                    to: gapi.EmailID, // list of receivers
                    subject: 'Validation Report ✔', // Subject line
                    text: 'The following files were processed on ' + moment().format('YYYY-MM-DD:hh:mm:ss') + '. Errors are attached.', // plain text body
                    html: 'The following files were processed on <b>' + moment().format('YYYY-MM-DD:hh:mm:ss') + '</b>. Errors are attached.', // html body
                    attachments: [
                        {   // file on disk as an attachment
                            filename: 'report.csv',
                            path: path // stream this file
                        }
                    ]
                };
                mailer.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        return console.log(error);
                    }
                    // console.log(info);
                    console.log('Email sent.');
                });
            }
            if (gdrive.gdrive) {
                iam.uploadToGDrive(gdrive.path, {folder_id: gdrive.folder_id, name: gdrive.name}, function (err, file) {
                    if (err) {
                        callback(err);
                    } else {
                        callback(null, file);
                    }
                })
            } else {
                callback(null, "done writing");
            }
        });
    },
    writeJsonToFile: function (data, path, gdrive, callback) {
        var iam = this;
        let fs_stream = fs.writeFile(path, JSON.stringify(data, null, 2), function (err) {
            if (err) {
                callback(err);
            } else {
                if (gdrive.gdrive) {
                    iam.uploadJsonToGDrive(gdrive.path, {
                        folder_id: gdrive.folder_id,
                        name: gdrive.name
                    }, function (err, file) {
                        if (err) {
                            callback(err);
                        } else {
                            callback(null, file);
                        }
                    })
                } else {
                    callback(null);
                }
            }
        });
    },

    uploadToGDrive: function (file, meta, callback) {
        var fileMetadata = {
            'name': meta.name,
            parents: [meta.folder_id]
        };
        var media = {
            mimeType: 'text/csv',
            body: fs.createReadStream(file)
        };
        drive.files.create({
            resource: fileMetadata,
            media: media,
        }, function (err, file) {
            if (err) {
                callback(err);
            } else {
                callback(null, file);
            }
        });

    },
    uploadJsonToGDrive: function (file, meta, callback) {
        var fileMetadata = {
            'name': meta.name,
            parents: [meta.folder_id]
        };
        var media = {
            mimeType: 'text/json',
            body: fs.createReadStream(file)
        };
        drive.files.create({
            resource: fileMetadata,
            media: media,
        }, function (err, file) {
            if (err) {
                callback(err);
            } else {
                callback(null, file);
            }
        });

    },
    gDriveMakeFolder: function (meta, callback) {
        var fileMetadata = {
            'name': meta.name,
            parents: [meta.folder_id],
            mimeType: 'application/vnd.google-apps.folder'
        };
        drive.files.create({
            resource: fileMetadata,
        }, function (err, file) {
            if (err) {
                callback(err);
            } else {
                callback(null, file);
            }
        });

    }
}

