const child_process = require('child_process');
const path = require('path');
const EventEmitter = require('events');

class PDO extends EventEmitter {
    constructor(options) {
        super();

        this.options = Object.assign({
            phpPath: "php",
            expandPlaceholders: true
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

    async send(cmd, ...params) {
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

    expandPlaceholders(sql, params = []) {
        let idx = -1;
        let xparams = [];
        let xsql = sql.replace(/\?/g, () => {
            idx++;
            if (idx >= params.length) {
                throw Error("Number of parameters doesn't match number of placeholders");
            }
            if (params[idx] instanceof Array) {
                xparams.push(...params[idx]);
                return Array(params[idx].length).fill('?').join(',');
            } else if (params[idx] instanceof Object) {
                let qs = [];
                for (let [k,v] of Object.entries(params[idx])) {
                    qs.push(`${k} = ?`);
                    xparams.push(v);
                }
                return qs;
            } else {
                xparams.push(params[idx]);
                return '?';
            }
        });
        return {xsql, xparams}
    }

    async open(connstr, ...more) {
        return this.send('open', connstr, ...more);
    }

    async exec(sql, params) {
        let {xsql, xparams} = this.options.expandPlaceholders ?
            this.expandPlaceholders(sql, params) :
            {sql, params};

        return this.send('exec', xsql, xparams);
    }

    async queryAll(sql, params) {
        let {xsql, xparams} = this.options.expandPlaceholders ?
            this.expandPlaceholders(sql, params) :
            {sql, params};

        return this.send('queryAll', xsql, xparams);
    }

    async queryOne(sql, params) {
        let {xsql, xparams} = this.options.expandPlaceholders ?
            this.expandPlaceholders(sql, params) :
            {sql, params};

        return this.send('queryOne', xsql, xparams);
    }

    async query(sql, params) {
        return this.queryAll(sql, params);
    }

    async queryColumn(sql, params, column = 0) {
        let res = Object.values(await this.queryOne(sql, params));
        return res[column];
    }
}

module.exports = PDO;
