var Ajv = require('ajv');
var ajv = new Ajv(
    {
        allErrors: true,
        verbose: false,
        jsonPointers: false,
    }
);

var schema = {
    properties: {
        foo: {type: 'string', format: "date-time"}
    }
};

var validate = ajv.compile(schema);
validate(
    {foo: "2015-02-41T17:05:24+08:00"}
);
console.log(validate.errors); // processed errors