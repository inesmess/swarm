"use strict";
var Spec = require('./Spec');

// *immutable* op: specifier, value and a patch (nested ops).
// empty value is '', not null, not undefined
function Op (spec, value, source, patch) {
    if (value===undefined) { // FIXME kill this, throw
        if (spec && spec.constructor===String) {
            var parsed = Op.parse(spec);
            if (parsed.ops.length!==1) {
                throw new Error('not a serialized op');
            }
            spec = parsed.ops[0];
        }
        if (spec && spec.constructor===Op) {
            var orig = spec;
            spec = orig.spec;
            value = orig.value;
            source = orig.source;
            patch = orig.patch;
        }
    }
    this.spec = spec && spec.constructor===Spec ?
        spec : new Spec(spec);

    // if (value && value.constructor===Object) {
    //     value = JSON.stringify(value);
    // }

    this.value = value ? value.toString() : '';
    this.source = source ? source.toString() : '';
    this.patch = patch || null;
    if (patch && patch.constructor!==Array) {
        throw new Error('need a patch as an array of Ops');
    }
}
module.exports = Op;
Op.handshake_ops = {on:1, off:1};

Op.create = function (triplet, source) {
    var patch = triplet[2] && triplet[2].map(function(o){
        if (o.constructor===Op) {return o;} // FIXME demand triplets
        return new Op(o[0],o[1],source,null);
    });
    return new Op(triplet[0], triplet[1], source, patch);
};
Op.prototype.triplet = function () {
    return [this.spec, this.value, this.patch];
};

// Epically monumental op-parsing regexes.
Op.rsSpec = '(?:'+Spec.rsQuant+'=(?:\\+=)?)+'.replace(/=/g, Spec.rT);
Op.rsPatchOp =  '\\n[ \\t]+' + Op.rsSpec + '[ \\t]+.*';
Op.rsPatchOpB = '\\n[ \\t]+(' + Op.rsSpec + ')[ \\t]+(.*)';
Op.rsOp = '(' + Op.rsSpec+')[ \\t]+(.*)((?:' + Op.rsPatchOp + ')*)';
Op.reOp = new RegExp(Op.rsOp, 'mg');
Op.rePatchOp = new RegExp(Op.rsPatchOpB, 'mg');

//
Op.parse = function (str, source, context) {
    Op.reOp.lastIndex = 0;
    var rem = str, m, mm, ops = [], d=0;
    while (m = Op.reOp.exec(rem)) {
        var spec = new Spec(m[1], null, context);
        var value = m[2], patch_str = m[3];
        var patch = null;
        if (patch_str) {
            var typeId = spec.typeId();
            patch = [];
            Op.rePatchOp.lastIndex = 0;
            while (mm = Op.rePatchOp.exec(patch_str)) {
                var op_spec = new Spec(mm[1], typeId);
                patch.push(new Op(op_spec, mm[2], source));
            }
        }
        ops.push(new Op(spec, value, source, patch));
        d = m.index + m[0].length;
    }
    rem = rem.substr(d);
    // comments and empty lines
    var next_nl = /\n+/g.exec(rem);
    if ( next_nl && next_nl.index===0 ) {
        rem = rem.substr(next_nl[0].length);
        // TODO detect unparseable strings
    }
    if (rem.indexOf('\n')!==-1 && !Op.reOp.exec(rem)) {
        console.error('unparseable input', rem);
        throw new Error('unparseable input');
    }
    if (rem.length>(1<<23)) { // 8MB op size limit? TODO
        throw new Error("large unparseable input");
    }

    return {ops: ops, remainder: rem};
};


Op.prototype.origin = function () {
    return this.spec.origin();
};
Op.prototype.stamp = function () {
    return this.spec.stamp();
};
Op.prototype.author = function () {
    return this.spec.author();
};
Op.prototype.typeid = function () {
    return this.spec.typeid();
};
Op.prototype.id = function () {
    return this.spec.id();
};
Op.prototype.name = function () {
    return this.spec.op();
};
Op.prototype.op = Op.prototype.name;

Op.prototype.version = function () {
    return this.spec.version();
};

Op.prototype.unbundle = function () {
    return this.patch;
};

// FIXME make efficient
Op.prototype.bundleLength = function () {
    return this.unbundle().length;
};

Op.prototype.toString = function (context) {
    var spec_str = context ?
        this.spec.toAbbrevString(context) : this.spec.toString();
    var line = spec_str + '\t' + this.value;// + '\n';
    if (this.name()==='on' && this.patch) {
        this.patch.forEach(function(o){
            line += '\n\t' + o.toShortString();
        });
    }
    return line;
};

Op.prototype.toShortString = function () {
    return this.spec.stampop() + '\t' + this.value;// + '\n';
};

Op.prototype.error = function (msg, src) {
    var msg50 = msg.toString().replace(/\n/g, ' ').substr(0,50);
    return new Op(this.spec.set('.error'), msg50, src||this.source);
};

/** handshake ops */
Op.prototype.reply = function (opname, value) {
    return new Op( this.spec.set('.'+opname), value||'', this.source, this.patch );
};

Op.prototype.relay = function (to_pipe) {
    return new Op(this.spec, this.value, to_pipe, this.patch );
};
