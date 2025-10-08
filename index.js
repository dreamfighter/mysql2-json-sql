const _ = require('lodash');
const mysql = require('mysql2');

let Query = class{
    constructor(conn, table, columns) {
        this.conn = conn;
        this.table = table;
        this._count = false;
        this._findOne = 0;
        this._join = '';
        this.query = "";
        this.srt = "";
        this._projection = [`${table}.*`];
        this.group = "";
        this._limit = "";
        this._skip = "";
        this.where = "";
        this._having = "";
        this.params = [];
        this.join_params = [];
        this.formating = null;
        this.columns = columns;
    }

    count(selection){
        this._count = true;
        this._projection=['count(*) count'];
        if(selection){
            return this.select(selection);
        }
        return this;
    }

    pagination(size,page){
        if(!page){
            page = 1;
        }
        page = page - 1;
        if(!size){
            size = 10;
        }
        const first = page * size;

        const mainQuery = this.skip(first).limit(size).async();
        this.nolimit();
        let builder = this.build();
        let countQuery = new Promise((resolve,reject)=>{
            const sql = `select count(*) count from (${builder.sql}) as c`;
            if(process.env.LOGGING === 'info'){
                console.log(sql);
                console.log(JSON.stringify(builder.params));
            }
            this.conn.query(sql,builder.params,(error, results) => {
                if(error){
                    reject(error);
                }else{
                    resolve(results);
                }

            });
        });

        return Promise.all([mainQuery,countQuery]).then((v)=>{
            const countResult = v[1][0];
            const count =  Math.ceil(countResult.count / size);
            return {data:v[0],count:count,total:countResult.count};
        }).catch(error => {
            console.log(error);
            return {data:[],count:0,total:0};
        });
    }

    projection(pro){
        const p = ['$max','$min','$sum','$avg','$count'];
        let exclude = _.cloneDeep(this.columns);
        for(const q in pro){
            if(p.includes(q)){
                for(const v in pro[q]){
                    if(v.indexOf('.')>0){
                        if(pro[q][v]===1){
                            this._projection.push(`${q.replace('$', '')}(${v}) '${v}'`);
                        }else{
                            this._projection.push(`${q.replace('$', '')}(${v}) '${pro[q][v]}'`);
                        }
                    }else{
                        this._projection.push(`${q.replace('$', '')}(${this.table}.${v}) ${v}`);
                    }
                }
            }else if(pro[q] === 1){
                if(q.indexOf('.')>0){
                    this._projection.push(`${q} '${q}'`);
                }else{
                    this._projection.push(`${this.table}.${q} ${q}`);
                }

            }else if(pro[q] !== 0){
                if(q.indexOf('.')>0){
                    this._projection.push(`${q} '${pro[q]}'`);
                }else{
                    this._projection.push(`${this.table}.${q} ${pro[q]}`);
                }

            }else{
                exclude = exclude.filter(d=>d!==q && `${this.table}.${d}`!==q);
            }
        }
        if(this._projection.length===1 && this._projection[0]===`${this.table}.*`){
            this._projection.push(...exclude.map(d=>`${this.table}.${d}`));
        }
        if(this._projection[0]===`${this.table}.*`){
            this._projection.splice(0, 1)
        }
        //console.log(this.columns);
        return this;
    }

    join(joinTable,proj,ref){
        var alias = joinTable;
        var joinTableName = joinTable;
        if(typeof joinTable !== 'string'){
            if(joinTable.table && joinTable.sql){
                joinTableName = `(${joinTable.sql})`;
                alias = joinTable.table;
                this.join_params = joinTable.params;

            }else if(joinTable.table && joinTable.alias){
                joinTableName = `${joinTable.table}`;
                alias = joinTable.alias;
            }else{
                for(const q in joinTable){
                    if(q!=='sql'){
                        alias = q;
                        joinTableName = `(${joinTable[q]})`;
                    }else{
                        joinTableName = `(${joinTable.sql})`;
                        alias = `${joinTable.alias}`;
                    }

                }
            }
        }

        if(proj){
            //var p = [];
            for(const q in proj){
                if(proj[q] === 1){
                    this._projection.push(`${alias}.${q} '${alias}.${q}'`);
                }else if(proj[q] !== 0){
                    this._projection.push(`${alias}.${q} '${proj[q]}'`);
                }
            }
            //this._projection = `${this._projection},${p.join(',')}`;
        }

        let on = '';
        if(!ref){
            on = `${this.table}._id=${alias}.${this.table}_id`;
        }else{
            let p = [];
            for(const q in ref){
                p.push(`${q}=${ref[q]}`);
            }
            on = p.join(' AND ');
        }

        this._join = `${this._join} JOIN ${joinTableName} ${alias} ON(${on})`;
        return this;
    }

    leftjoin(joinTable,proj,ref){
        var alias = joinTable;
        var joinTableName = joinTable;
        if(typeof joinTable !== 'string'){
            if(joinTable.table && joinTable.sql){
                joinTableName = `(${joinTable.sql})`;
                alias = joinTable.table;
                this.join_params = joinTable.params;

            }else if(joinTable.table && joinTable.alias){
                joinTableName = `${joinTable.table}`;
                alias = joinTable.alias;
            }else{
                for(const q in joinTable){
                    if(q!=='sql'){
                        alias = q;
                        joinTableName = `(${joinTable[q]})`;
                    }else{
                        joinTableName = `(${joinTable.sql})`;
                        alias = `${joinTable.alias}`;
                    }

                }
            }

        }

        if(proj){
            //var p = [];
            for(const q in proj){
                if(proj[q] == 1){
                    this._projection.push(`${alias}.${q} '${alias}.${q}'`);
                }else if(proj[q] !== 0){
                    this._projection.push(`${alias}.${q} '${proj[q]}'`);
                }
            }
            //this._projection = `${this._projection},${p.join(',')}`;
        }

        let on = '';
        if(!ref){
            on = `${this.table}._id=${alias}.${this.table}_id`;
        }else{
            var p = [];
            for(const q in ref){
                p.push(`${q}=${ref[q]}`);
            }
            on = p.join(' AND ')
        }

        this._join = `${this._join} LEFT JOIN ${joinTableName} ${alias} ON(${on})`;
        return this;
    }

    select(selection){
        const table = this.table;
        const params = this.params;
        //var or = ""
        let wh = "1=1"
        const ff = function (selection, operator, opPrefix){
            const func = ff;

            let op = "AND";
            if(operator){
                op = operator;
            }
            for(const q in selection) {
                if (q ==='groupBy'){
                    continue;
                }else if(q === '$or'){
                    if( Array.isArray(selection[q])){
                        wh = `${wh} ${opPrefix?opPrefix:op} (1=0`;
                        selection[q].map(_or => {
                            func(_or,'OR');
                        });
                        wh = `${wh}) `;
                    }else{
                        func(selection[q],'OR', 'OR');
                    }

                }else if(q === '$and'){
                    if( Array.isArray(selection[q])){
                        wh = `${wh} ${opPrefix?opPrefix:op} (1=1`;
                        selection[q].map(_and => {
                            func(_and,'AND');
                        });
                        wh = `${wh}) `;
                    }else{
                        func(selection[q],'AND', 'AND');
                    }
                }else if(selection[q] != null && typeof selection[q] == 'object' &&
                    ("$ref" in selection[q] || "$in" in selection[q] || "$nin" in selection[q] || "$gt" in selection[q] || "$lt" in selection[q] || "$gte" in selection[q] || "$lte" in selection[q])){
                    if(selection[q].$in){
                        var $in = selection[q].$in.map(d=>{
                            params.push(d);
                            return '?';
                        });
                        if(q.indexOf('.')>0){
                            wh = `${wh} ${op} ${q} IN (${$in}) `;
                        }else{
                            wh = `${wh} ${op} ${table}.${q} IN (${$in}) `;
                        }
                    }
                    if(selection[q].$nin){
                        const $nin = selection[q].$nin.map(d => {
                            params.push(d);
                            return '?';
                        });
                        if(q.indexOf('.')>0){
                            wh = `${wh} ${op} ${q} NOT IN (${$nin}) `;
                        }else{
                            wh = `${wh} ${op} ${table}.${q} NOT IN (${$nin}) `;
                        }
                    }

                    if(selection[q].$gt){
                        //console.log(selection[q]);
                        var $gt = selection[q].$gt;
                        params.push($gt);
                        if(q.indexOf('.')>0){
                            wh = `${wh} ${op} ${q} > ? `;
                        }else{
                            wh = `${wh} ${op} ${table}.${q} > ? `;
                        }
                    }

                    if(selection[q].$gte){
                        //console.log(selection[q]);
                        var $gt = selection[q].$gte;
                        params.push($gt);
                        if(q.indexOf('.')>0){
                            wh = `${wh} AND ${q} >= ? `;
                        }else{
                            wh = `${wh} AND ${table}.${q} >= ? `;
                        }
                    }

                    if(selection[q].$lt){
                        var $lt = selection[q].$lt
                        params.push($lt);
                        if(q.indexOf('.')>0){
                            wh = `${wh} AND ${q} < ? `;
                        }else{
                            wh = `${wh} AND ${table}.${q} < ? `;
                        }
                    }

                    if(selection[q].$lte){
                        var $lt = selection[q].$lte
                        params.push($lt);
                        if(q.indexOf('.')>0){
                            wh = `${wh} AND ${q} <= ? `;
                        }else{
                            wh = `${wh} AND ${table}.${q} <= ? `;
                        }
                    }

                    if(selection[q].$ref){
                        let ref = selection[q].$ref;
                        if(q.indexOf('.')>0){
                            wh = `${wh} ${op} ${q} = ${ref} `;
                        }else{
                            wh = `${wh} ${op} ${table}.${q} = ${ref} `;
                        }
                    }

                }else if(selection[q] && selection[q]['$ne']){
                    if(q.indexOf('.')>0){
                        wh = `${wh} ${op} ${q}<>? `;

                        params.push(selection[q]['$ne']);
                    }else{
                        wh = `${wh} ${op} ${table}.${q}<>? `;

                        params.push(selection[q]['$ne']);
                    }
                }else if(selection[q] && (selection[q]['$null']===1 || selection[q]['$null']===0)){
                    let $null = 'is not null';
                    if(selection[q]['$null']===1){
                        $null = 'is null';
                    }
                    if(q.indexOf('.')>0){
                        wh = `${wh} ${op} ${q} ${$null}  `;
                    }else{
                        wh = `${wh} ${op} ${table}.${q} ${$null}`;
                    }
                }else if(selection[q] && selection[q]['$regex']){
                    const val = `^${selection[q]['$regex']}`;
                    if(q.indexOf('.')>0){
                        wh = `${wh} ${op} REGEXP_LIKE(${q}, ?) `;
                    }else{
                        wh = `${wh} ${op} REGEXP_LIKE(${table}.${q}, ?) `;
                    }
                    params.push(val.replace(/\//g, ''));
                }else if(selection[q] && selection[q]['$like']){
                    const val = `${selection[q]['$like']}`;
                    if(q.indexOf('.')>0){
                        wh = `${wh} ${op} ${q} LIKE ? `;
                    }else{
                        wh = `${wh} ${op} ${table}.${q} LIKE ? `;
                    }
                    params.push(val.replace(/\//g, ''));
                }else if(q.indexOf('.')>0){
                    wh = `${wh} ${op} ${q}=? `;

                    params.push(selection[q]);
                }else{
                    wh = `${wh} ${op} ${table}.${q}=? `;

                    params.push(selection[q]);
                }

            }
        }
        ff(selection);
        this.where = `WHERE ${wh}`;

        //this.where = `${this.where}`;

        //this.conn.query(query)
        return this;
    }

    sort(s){
        let ss = [];
        for (const q in s) {
            if (s[q] === 1) {
                if (q.indexOf('.') > 0) {
                    ss.push(`${q} ASC`);
                } else {
                    ss.push(`${this.table}.${q} ASC`);
                }
            } else if (s[q] === -1) {
                if (q.indexOf('.') > 0) {
                    ss.push(`${q} DESC`);
                } else {
                    ss.push(`${this.table}.${q} DESC`);
                }
            }else{
                ss.push(`${q} ${s[q]}`);
            }
        }
        this.srt = `ORDER BY ${ss.join(',')}`;
        return this;
    }

    groupBy(ss){
        this.group = `GROUP BY ${ss.join(',')}`;
        return this;
    }

    having(hv){
        const h = [];
        const p = ['$max','$min','$sum','$avg','$count'];
        const operators = {
            '$gt':'>',
            '$lt':'<',
            '$ne':'<>',
            '$eq':'=',
            '$gte':'>=',
            '$lte':'<='
        };
        for(const q in hv){
            if(p.includes(q)){
                for(const v in hv[q]){
                    if(typeof hv[q][v] == 'object'){
                        for(const op in hv[q][v]){
                            if(v.indexOf('.')>0){
                                h.push(`${q.replace('$', '')}(${v}) ${operators[op]} ?`);
                            }else{
                                h.push(`${q.replace('$', '')}(${this.table}.${v}) ${operators[op]} ?`);
                            }
                            this.params.push(hv[q][v][op]);
                        }
                    }else{
                        if(v.indexOf('.')>0){
                            h.push(`${q.replace('$', '')}(${v}) = ?`);
                        }else{
                            h.push(`${q.replace('$', '')}(${this.table}.${v}) = ?`);
                        }
                        this.params.push(hv[q][v]);
                    }
                }
            }
        }
        this._having = `HAVING ${h.join(' AND ')}`;
        return this;
    }

    skip(n){
        if(n<0){
            n = 0;
        }
        this._skip = `LIMIT  ${n}`;
        return this;
    }

    limit(n){
        if(this._findOne === 0){
            this._limit = `,${n}`;
        }

        return this;
    }

    nolimit(n){
        this._limit = '';
        this._skip = '';
        return this;
    }

    insert(data,callback){
        if(callback){
            return this.insertQ(data,callback);
        }else{
            return new Promise((resolve,reject)=>{
                this.insertQ(data,(error,results)=>{
                    if(error){
                        reject(error);
                    }else{
                        resolve(results);
                    }

                });
            });
        }
    }

    update(data,callback){
        if(callback){
            return this.updateQ(data,callback);
        }else{
            return new Promise((resolve,reject)=>{
                this.updateQ(data,(error,results)=>{
                    if(error){
                        reject(error);
                    }else{
                        resolve(results);
                    }

                });
            });
        }
    }

    delete(callback){
        if(callback) {
            return this.deleteQ(callback);
        }else{
            return new Promise((resolve,reject)=>{
                this.deleteQ((error,results)=>{
                    if(error){
                        reject(error);
                    }else{
                        resolve(results);
                    }
                });
            });
        }
    }

    insertQ(data,callback){
        const keys = [];
        const values = [];
        const questionMark = [];

        var q = "";
        if(Array.isArray(data)){
            const vals = [];
            for(const v in data[0]){
                keys.push(v);
            }
            data.map(d=>{
                const valInside = [];
                for(const v in d){
                    valInside.push(d[v]);
                }
                vals.push(valInside);
            });
            values.push(vals);
            //console.log(this);
            q = `INSERT INTO ${this.table} (${keys.join(',')}) VALUES ?`;
        }else{
            for(const v in data){
                keys.push(v);
                values.push(data[v]);
                questionMark.push('?');
            }
            //console.log(this);
            q = `INSERT INTO ${this.table} (${keys.join(',')}) VALUES (${questionMark.join(',')})`;
        }
        //this.conn.getConnection(function(err, conn) {

        if(process.env.LOGGING === 'info'){
            console.log(q);
            console.log(values);
        }

        let c = callback;
        return this.conn.query(q, values,(error, results) => {
            if(error){
                console.log(error);
            }else{
                data._id = results.insertId;
            }
            c(error,results,data);
        });
        //});
    }

    async insertTrx(data){
        const keys = [];
        const values = [];
        const questionMark = [];

        var q = "";
        if(Array.isArray(data)){
            const vals = [];
            for(const v in data[0]){
                keys.push(v);
            }
            data.map(d=>{
                const valInside = [];
                for(const v in d){
                    valInside.push(d[v]);
                }
                vals.push(valInside);
            });
            values.push(vals);
            //console.log(this);
            q = `INSERT INTO ${this.table} (${keys.join(',')}) VALUES ?`;
        }else{
            for(const v in data){
                keys.push(v);
                values.push(data[v]);
                questionMark.push('?');
            }
            //console.log(this);
            q = `INSERT INTO ${this.table} (${keys.join(',')}) VALUES (${questionMark.join(',')})`;
        }
        //this.conn.getConnection(function(err, conn) {

        if(process.env.LOGGING === 'info'){
            console.log(q);
            console.log(values);
        }

        let results = await this.conn.query(q, values);
        data._id = results.insertId;
        return data;
    }

    async updateTrx(data){
        const keys = [];
        const sets = [];
        const values = [];
        if(data['$set']){
            for(const v in data['$set']){
                let set = `${v}=?`;
                sets.push(set);
                values.push(data['$set'][v]);
            }
        }else{
            for(const v in data){
                let set = `${v}=?`;
                sets.push(set);
                values.push(data[v]);
            }
        }

        for(const p in this.params){
            //console.log(p);
            if(p === 'groupBy'){
                continue;
            }
            values.push(this.params[p]);
        }


        let q = `UPDATE ${this.table} SET ${sets.join(',')} ${this.where}`;
        //this.conn.getConnection(function(err, conn) {
        if(process.env.LOGGING === 'info'){
            console.log(q);
            console.log(values);
        }

        return await this.conn.query(q, values);
    }

    updateQ(data,callback){
        const keys = [];
        const sets = [];
        const values = [];
        if(data['$set']){
            for(const v in data['$set']){
                let set = `${v}=?`;
                sets.push(set);
                values.push(data['$set'][v]);
            }
        }else{
            for(const v in data){
                let set = `${v}=?`;
                sets.push(set);
                values.push(data[v]);
            }
        }

        for(const p in this.params){
            //console.log(p);
            if(p === 'groupBy'){
                continue;
            }
            values.push(this.params[p]);
        }


        let q = `UPDATE ${this.table} SET ${sets.join(',')} ${this.where}`;
        //this.conn.getConnection(function(err, conn) {
        if(process.env.LOGGING === 'info'){
            console.log(q);
            console.log(values);
        }
        let c = callback;
        return this.conn.query(q, values,(error, results) => {
            if(error){
                console.error(error);
            }
            c(error,results);
        });
        //});
    }

    deleteQ(callback){
        var p = this.params;
        let q = `DELETE FROM ${this.table} ${this.where}`;
        //this.conn.getConnection(function(err, conn) {
        if(process.env.LOGGING === 'info'){
            console.log(q);
            console.log(p);
        }
        let c = callback;
        return this.conn.query(q, p,(error, results) => {
            if(error){
                console.log(error);
            }
            c(error,results);
        });
        //});
    }

    format(){
        this.formating = format;
        return this;
    }

    build(){
        return {
            sql:`SELECT ${this._projection.join(',')} FROM ${this.table} ${this._join} ${this.where} ${this.group} ${this._having} ${this.srt} ${this._skip} ${this._limit}`,
            params:this.params, count:this._count, findOne:this._findOne, table:this.table
        };
    }

    async(){
        return this.exec();
    }

    exec(callback){

        this.query = `SELECT ${this._projection.join(',')} FROM ${this.table} ${this._join} ${this.where} ${this.group} ${this._having} ${this.srt} ${this._skip} ${this._limit}`;
        //console.log(this.query);
        const q = this.query;
        const p = this.params;
        const _c = this._count;
        const _f = this._findOne;
        const _formating = this.formating;
        if(this.join_params && this.join_params.length>0){
            this.join_params.map((data,i)=>{
                p.splice(i, 0, data);
            });
        }
        //this.conn.getConnection(function(err, conn) {
        if(process.env.LOGGING === 'info'){
            console.log(q);
            console.log(JSON.stringify(p));
        }
        //console.log(_c);
        if(callback){
            if(_c){
                return this.conn.query(q,p, (err,result)=>{
                    if(result && result.length>0){
                        return callback(err,result[0].count);
                    }else{
                        console.log(err);
                        return callback(err,0);
                    }

                });
            }else if(_f){
                return this.conn.query(q,p, (err,result)=>{
                    if(result){
                        if(_formating!=null){
                            return callback(err,_formating(result[0]));
                        }
                        return callback(err,result[0]);
                    }else{
                        console.log(err);
                        return callback(err,{});
                    }
                });
            }else{
                return this.conn.query(q,p, (err,result)=>{
                    if(result){
                        if(_formating!=null){
                            return callback(err,_formating(result));
                        }
                        return callback(err,result);
                    }else{
                        console.log(err);
                        return callback(err,{});
                    }

                });

            }
        }else{
            return new Promise((resolve,reject)=>{
                if(_c){
                    return this.conn.query(q,p, (err,result)=>{
                        if(result && result.length>0){
                            return resolve(result[0].count);
                        }else{
                            console.log(err);
                            return reject(err);
                        }

                    });
                }else if(_f){
                    return this.conn.query(q,p, (err,result)=>{
                        if(result){
                            if(_formating!=null){
                                return resolve(_formating(result[0]));
                            }
                            return resolve(result[0]);
                        }else{
                            console.log(err);
                            return reject(err);
                        }
                    });
                }else{
                    return this.conn.query(q,p, (err,result)=>{
                        if(result){
                            if(_formating!=null){
                                return resolve(_formating(result));
                            }
                            return resolve(result);
                        }else{
                            console.log(err);
                            return reject(err);
                        }

                    });

                }
            });
        }

    }
}

let smt = class{
    constructor(conn, table, column) {
        this.conn = conn;
        this.table = table;
        this.column = column;
    }

    getConnection(){
        return this.conn.promise()
    }

    find(selection,callback){
        const sel = _.cloneDeep(selection);
        if(callback){
            return new Query(this.conn,this.table,this.column).select(sel).exec(callback);
        }else{
            return new Query(this.conn,this.table,this.column).select(sel);
        }

    }

    findOne(selection,callback){
        const sel = _.cloneDeep(selection);
        if(callback){
            let q = new Query(this.conn,this.table,this.column).select(sel);
            q._findOne = 1;
            q._limit = `LIMIT 1`;
            q.exec(callback);
            return q;
        }else{
            let q = new Query(this.conn,this.table,this.column).select(sel);
            q._findOne = 1;
            q._limit = `LIMIT 1`;
            return q;
        }

    }

    count(selection,callback){
        const sel = _.cloneDeep(selection);
        if(callback){
            return new Query(this.conn,this.table,this.column).count(sel).exec(callback);
        }else{
            return new Query(this.conn,this.table,this.column).count(sel);
        }
    }

    insert(data,callback){
        return new Query(this.conn,this.table,this.column).insert(data,callback);
    }

    insertTrx(data){
        return new Query(this.conn,this.table,this.column).insertTrx(data);
    }

    delete(selection,callback){
        const sel = _.cloneDeep(selection);
        return new Query(this.conn,this.table,this.column).select(sel).delete(callback);
    }

    update(selection,data,options,callback){
        const sel = _.cloneDeep(selection);
        if(!callback){
            callback = options;
        }
        return new Query(this.conn,this.table,this.column).select(sel).update(data,callback);
    }

    updateTrx(selection,data){
        const sel = _.cloneDeep(selection);
        return new Query(this.conn,this.table,this.column).select(sel).updateTrx(data);
    }

    query(sql,params){
        return new Promise((resolve, reject) => {
            this.conn.query(sql,params, (err,result)=>{
                if(result && result.length>0){
                    resolve(err,result);
                }else{
                    reject(err);
                }
            });
        });
    }


    async asyncTransaction(trx){
        const promisePool = this.conn.promise();

        //const tableName = this.table;
        let connn = await promisePool.getConnection();
        try {
            await connn.beginTransaction();
            const tables = {};
            for(const t in datasource[config.database]){
                tables[t] = new smt(connn, t);
            }
            await trx(connn,tables);
            await connn.commit();
            console.log('committed!');

            return null;
        }
        catch (error) {
            await connn.rollback();
            console.log('rollback!',error);
            promisePool.releaseConnection();
            return error;
        }
    }

    transaction(trx,clbk){
        const promisePool = this.conn.promise();

        //const tableName = this.table;
        let connn;
        promisePool.getConnection()
            .then(connection => {
                connn = connection;
                return connection.query('START TRANSACTION');
            })
            .then( () => {
                const tables = {};
                for(const t in datasource[connn.config.database]){
                    tables[t] = new smt(connn, t);
                }
                return trx(connn,tables);
                // do queries inside transaction
            }).then( () => {
            console.log('committed!');
            clbk(null,{});
            return connn.query('COMMIT');
        }).catch(err=>{
            console.log('rollback!');
            clbk(err,{});
            connn.query('ROLLBACK');
            //console.log(err)
        });

    }
}

function format(data){
    if(Array.isArray(data)){
        return data.map(d=>{
            if(d){
                return format(d);
            }
            return d;
        });
    }else{
        for(const d in data){
            var key = d.split('.');
            if(key.length==2){
                if(!data[key[0]]){
                    data[key[0]]= {};
                }

                data[key[0]][key[1]] = data[d];

                delete data[d];
            }

        }
    }

    return data;
}

const datasource = {};
let config = {};
module.exports.datasource = datasource;
module.exports = (conn, table) => {
    if(table){
        config = conn.config.connectionConfig;
        let dbStr = conn.config.connectionConfig;
        if(conn.config.connectionConfig){
            dbStr = conn.config.connectionConfig.database;
        }else{
            dbStr = conn.config.database;
        }
        if(!datasource[dbStr]){
            const db = {};
            db[table] = new smt(conn, table);
            datasource[dbStr] = db;
        }else{
            datasource[dbStr][table] = new smt(conn, table);
        }
        return datasource[dbStr][table];
    }else{
        const db = {};
        const connDB = mysql.createPool(conn);
        config = conn;

        db.tables = async function(){
            const connPromise = connDB.promise()
            const result = await Promise.all([
                connPromise.query('SHOW TABLES')
            ]);
            const [rows,fields] = result[0];

            const columns = await Promise.all(rows.map(d=> {
                const tableName = d[fields[0].name];
                return connPromise.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tableName}'`)
            }));

            rows.map((d,i)=> {
                const tableName = d[fields[0].name];
                db[tableName] = new smt(connDB, tableName, columns[i][0].map(c=>c.COLUMN_NAME));
            });
            return db;
        }

        db.table = function(name){
            db[name] = new smt(connDB, name);
            return db[name];
        }
        //datasource[conn.database].conn = conn;
        datasource[conn.database] = db;
        datasource['query'] = function(sql,params){
            return new Promise((resolve, reject) => {
                connDB.query(sql,params, (err,result)=>{
                    if(result && result.length>0){
                        resolve(result);
                    }else{
                        reject(err);
                    }
                });
            });
        }
        return datasource;
    }
};

module.exports.format = (dt) => format(dt);
