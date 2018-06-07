'use strict';

const child_process = require('child_process');
const path = require('path');
const EventEmitter = require('events');

class PDO extends EventEmitter {
    constructor(options) {
        super();

        this.options = Object.assign({
            phpPath: "php",
            expandPlaceholders: true,
            closeCursorAfterExec: false,
            stringifyFetches: false,
            emulatePrepares: false,
            timeoutSeconds: 0
        }, options || {});

        this.buffer = null;
        this.idx = 0;
        this.jobs = [];

        this.cp = child_process.spawn(this.options.phpPath, [path.resolve(__dirname, 'host.php')], {
            cwd: __dirname,
            detatched: false,
            stdio: 'pipe',
            shell: false,
            windowsVerbatimArguments: true,
            windowsHide: true
        });

        this.cp.stdout.on('data', d => {
            this.buffer = this.buffer ? Buffer.concat([this.buffer, d]) : d;
            while (this.parseBuffer()) {}
        });

        this.cp.on('error', err => this.emit('error', err));
    }

    parseBuffer() {
        if (this.buffer.length < 4) return;
        let len = this.buffer.readUInt32LE();
        if (this.buffer.length < (4 + len)) return;
        let str = this.buffer.toString('utf8', 4, 4+len);
        this.buffer = this.buffer.slice(4 + len);
        let data = JSON.parse(str);
        // console.log('DECODED', data);
        let job = this.jobs.find(j => j.idx === data.idx);
        if (job) {
            this.jobs.splice(this.jobs.indexOf(job), 1);
            if (data.error) {
                let e = Error(data.error.message);
                e.sqlState = data.error.sqlState;
                e.driverCode = data.error.driverCode;
                e.driverMessage = data.error.driverMessage;
                e.type = data.error.type;
                e.stack = data.error.message +"\r\n"+ data.error.stack;
                job.reject(e);
            } else {
                job.resolve(data.result);
            }
        }
        return true;
    }

    send(/*cmd, ...params*/) {
        return Promise.resolve().then(() => {
            let params = Array.from(arguments);
            let cmd = params.shift();

            let job = {idx: ++this.idx};
            let prom = new Promise(function(resolve, reject){
                job.resolve = resolve;
                job.reject = reject;
            });
            this.jobs.push(job);
            const data = Buffer.from(JSON.stringify({idx: job.idx, cmd, params}));
            let len = Buffer.alloc(4);
            len.writeInt32LE(data.length);
            this.write(len);
            this.write(data);
            return prom;
        });
    }

    write(data) {
        this.cp.stdin.write(data);
    }

    close() {
        let len = Buffer.alloc(4);
        len.writeInt32LE(0);
        this.write(len);
        this.cp.stdin.end();
    }

    expandPlaceholders(sql, params/* = []*/) {
        if (params === undefined) params = [];
        let idx = -1;
        let xparams = [];
        let xsql = sql.replace(/\?/g, () => {
            idx++;
            if (idx >= params.length) {
                throw Error("Number of parameters doesn't match number of placeholders");
            }
            if (params[idx] instanceof Array) {
                xparams.push.apply(xparams, params[idx]);
                return Array(params[idx].length).fill('?').join(',');
            } else if (params[idx] instanceof Object) {
                let qs = [];
                let paramsEntries = Object.keys(params[idx]).map(k => [k, params[idx][k]]);
                for (let kv of paramsEntries) {
                    qs.push(`${kv[0]} = ?`);
                    xparams.push(kv[1]);
                }
                return qs;
            } else {
                xparams.push(params[idx]);
                return '?';
            }
        });
        return {xsql, xparams}
    }

    open(/*connstr, ...more*/) {
        let args = Array.from(arguments);
        args.unshift('open');
        args.push(this.options);
        return this.send.apply(this, args);
    }

    exec(sql, params) {
        return Promise.resolve().then(() => {
            let x = this.options.expandPlaceholders ?
                this.expandPlaceholders(sql, params) :
                {xsql: sql, xparams: params};

            return this.send('exec', x.xsql, x.xparams);
        });
    }

    queryAll(sql, params) {
        return Promise.resolve().then(() => {
            let x = this.options.expandPlaceholders ?
                this.expandPlaceholders(sql, params) :
                {xsql: sql, xparams: params};

            return this.send('queryAll', x.xsql, x.xparams);
        });
    }

    queryOne(sql, params) {
        return Promise.resolve().then(() => {
            let x = this.options.expandPlaceholders ?
                this.expandPlaceholders(sql, params) :
                {xsql: sql, xparams: params};

            return this.send('queryOne', x.xsql, x.xparams);
        });
    }

    query(sql, params) {
        return this.queryAll(sql, params);
    }

    queryColumn(sql, params, column/* = 0*/) {
        if (column === undefined) column = 0;
        return this.queryOne(sql, params).then(function(result){
            let keys = Object.keys(result);
            if (!keys.length) return undefined;
            return result[keys[0]];
        });
    }
}

module.exports = PDO;
