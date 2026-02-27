const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'test',
        pass: 'test',
    },
    connectionTimeout: 10000,
});
transporter.verify((err, success) => {
    if (err) console.error(err.message);
    else console.log('success');
});
