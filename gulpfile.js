const fse = require('fs-extra');
const path = require('path');
const glob = require("glob");
const gulp = require("gulp");
const log = require('fancy-log');

var i,j,k;

var PonyINI = {
    parse: function (text) {
        var lines = text.split(/\r?\n/);
        var rows = [];
        for (i = 0, n = lines.length; i < n; ++ i) {
            var line = lines[i].trim();
            if (line.length === 0 || line.charAt(0) === "'")
                continue;
            var row = [];
            line = this.parseLine(line,row);
            if (line.length !== 0) {
                console.error("trailing text:",line);
            }
            rows.push(row);
        }
        return rows;
    },
    parseLine: function (line,row) {
        var pos;
        while ((line = line.trimLeft()).length > 0) {
            var ch = line.charAt(0);
            switch (ch) {
                case '"':
                    line = line.slice(1);
                    pos = line.search('"');
                    if (pos < 0) pos = line.length;
                    row.push(line.slice(0,pos));
                    line = line.slice(pos);
                    if (line.length > 0) {
                        ch = line.charAt(0);
                        if (ch === '"') {
                            line = line.slice(1).trimLeft();
                            ch = line.charAt(0);
                        }
                        if (line.length > 0) {
                            if (ch === ',') {
                                line = line.slice(1);
                            }
                            else if (ch !== '}') {
                                console.error("data after quoted string:",line);
                            }
                        }
                    }
                    else {
                        console.error("unterminated quoted string");
                    }
                    break;

                case ',':
                    line = line.slice(1);
                    row.push("");
                    break;

                case '{':
                    var nested = [];
                    row.push(nested);
                    line = this.parseLine(line.slice(1),nested).trimLeft();
                    if (line.length > 0) {
                        ch = line.charAt(0);
                        if (ch !== '}') {
                            console.error("data after list:",line);
                        }
                        else {
                            line = line.slice(1).trimLeft();
                            ch = line.charAt(0);
                        }

                        if (ch === ',') {
                            line = line.slice(1);
                        }
                    }
                    else {
                        console.error("unterminated list");
                    }
                    break;

                case '}':
                case '\n':
                    return line;

                default:
                    pos = line.search(/[,}]/);
                    if (pos < 0) pos = line.length;
                    row.push(line.slice(0,pos).trim());
                    line = line.slice(pos);
                    if (line.length > 0) {
                        ch = line.charAt(0);
                        if (ch === ',') {
                            line = line.slice(1);
                        }
                        else if (ch !== '}') {
                            console.error("syntax error:",line);
                        }
                    }
            }
        }
        return line;
    }
};

function cleanName(name){
    return name
        .replace(/[%'\s"]+/g, "_") //replace %, quotes, spaces
        .replace(/_+/, "_"); // replace double _
}

function repairIniFiles(IniPath) {
    let iniFiles = glob.sync(IniPath+"/**/pony.ini");

    let configPonies = [];

    for (let i = 0; i < iniFiles.length; i++) {
        let file = iniFiles[i];
        let ini = PonyINI.parse(fse.readFileSync(file).toString());

        for (j = 0; j < ini.length; j++) {
            let line = ini[j];
            switch(line[0]){
                case "Name":
                    ini[j][1] = cleanName(ini[j][1]);
                    break;
                case "Behavior":
                    ini[j][6] = cleanName(ini[j][6]);

                    ini[j][7] = cleanName(ini[j][7]);
                    break;
                case "Speak":
                    if(line[1].match(/Soundboard.*/)){
                        for (var k = 0; k < line[3].length; k++) {
                            ini[j][3][k] = cleanName(line[3][k]);
                        }
                    }
                    break;
            }
        }

        var iniString = "";
        for (j = 0; j < ini.length; j++) {
            var poni = ini[j];

            var line = "";
            for (var k = 0; k < poni.length; k++) {
                var subObject = poni[k];

                if(Array.isArray(subObject)){
                    line += "{";
                    for (var l = 0; l < subObject.length; l++) {
                        var subSubOject = subObject[l];

                        if(subSubOject.match(/\s/) || subSubOject.match(/,/)){
                            line += '"'+subSubOject+'",';
                        }
                        else{
                            line += subSubOject+",";
                        }
                    }
                    line = line.slice(0, -1);

                    line += "},";
                }
                else{
                    let subString = subObject;

                    if(subObject.match(/\s/) || subObject.match(/,/)){
                        subString = '"'+subString+'"';
                    }

                    line += subString+",";
                }
            }

            iniString += line.slice(0, -1)+"\n";
        }

        fse.writeFileSync(path.dirname(file)+"/_pony.ini", iniString );
        configPonies.push({
            ini:iniString,
            baseurl:"ponies/"+path.basename(path.dirname(file))+"/"
        })
    }

    fse.writeFileSync(IniPath+"/"+"config.json", JSON.stringify(configPonies));
}

function parseBoolean(value) {
    var s = value.trim().toLowerCase();
    if (s === "true") return true;
    else if (s === "false") return false;
    else throw new Error("illegal boolean value: "+value);
};

var parsePoint = function (value) {
    if (typeof(value) === "string")
        value = value.split(",");
    if (value.length !== 2 || !/^\s*-?\d+\s*$/.test(value[0]) || !/^\s*-?\d+\s*$/.test(value[1])) {
        throw new Error("illegal point value: "+value.join(","));
    }
    return {x: parseInt(value[0],10), y: parseInt(value[1],10)};
};

var AllowedMoves = {
    None:               0,
    HorizontalOnly:     1,
    VerticalOnly:       2,
    HorizontalVertical: 3,
    DiagonalOnly:       4,
    DiagonalHorizontal: 5,
    DiagonalVertical:   6,
    All:                7,
    MouseOver:          8,
    Sleep:              9,
    Dragged:           10
};

var Locations = {
    Top:           0,
    Bottom:        1,
    Left:          2,
    Right:         3,
    BottomRight:   4,
    BottomLeft:    5,
    TopRight:      6,
    TopLeft:       7,
    Center:        8,
    Any:           9,
    AnyNotCenter: 10
};

var AudioMimeTypes = {
    wav:  'audio/wav',
    webm: 'audio/webm',
    mpeg: 'audio/mpeg',
    mpga: 'audio/mpeg',
    mpg:  'audio/mpeg',
    mp1:  'audio/mpeg;codecs="mp1"',
    mp2:  'audio/mpeg;codecs="mp2"',
    mp3:  'audio/mpeg;codecs="mp3"',
    mp4:  'audio/mp4',
    mp4a: 'audio/mp4',
    ogg:  'audio/ogg',
    oga:  'audio/ogg',
    flac: 'audio/ogg;codecs="flac"',
    spx:  'audio/ogg;codecs="speex"'
};

function repairPonies(path){
    let dirs = fse.readdirSync(path);

    for (let i = 0; i < dirs.length; i++) {
        let dir = dirs[i];

        let newDir = path+"/"+dir
            .replace(/[%'\s"]+/g, "_") //replace %, quotes, spaces
            .replace(/_+/, "_"); // replace double _

        if(dir !== newDir){
            fse.moveSync(path+"/"+dir, newDir);

            log(path+"/"+dir+" => "+newDir+" success");
            if(fse.lstatSync(newDir).isDirectory()){
                repairPonies(newDir);
            }
        }
        else{
            log(newDir);
            if(fse.lstatSync(path+"/"+newDir).isDirectory()){
                repairPonies(path+"/"+newDir);
            }
        }
    }
}


function repairIniFiles(IniPath) {
    let iniFiles = glob.sync(IniPath+"/**/pony.ini");

    let configPonies = [];

    for (let i = 0; i < iniFiles.length; i++) {
        let file = iniFiles[i];
        let ini = PonyINI.parse(fse.readFileSync(file).toString());

        for (let j = 0; j < ini.length; j++) {
            let line = ini[j];
            switch(line[0]){
                case "Name":
                    ini[j][1] = cleanName(ini[j][1]);
                    break;
                case "Behavior":
                    ini[j][6] = cleanName(ini[j][6]);

                    ini[j][7] = cleanName(ini[j][7]);
                    break;
                case "Speak":
                    if(line[1].match(/Soundboard.*/)){
                        for (var k = 0; k < line[3].length; k++) {
                            ini[j][3][k] = cleanName(line[3][k]);
                        }
                    }
                    break;
            }
        }

        var iniString = "";
        for (var j = 0; j < ini.length; j++) {
            var poni = ini[j];

            var line = "";
            for (var k = 0; k < poni.length; k++) {
                var subObject = poni[k];

                if(Array.isArray(subObject)){
                    line += "{";
                    for (var l = 0; l < subObject.length; l++) {
                        var subSubOject = subObject[l];

                        if(subSubOject.match(/\s/) || subSubOject.match(/,/)){
                            line += '"'+subSubOject+'",';
                        }
                        else{
                            line += subSubOject+",";
                        }
                    }
                    line = line.slice(0, -1);

                    line += "},";
                }
                else{
                    let subString = subObject;

                    if(subObject.match(/\s/) || subObject.match(/,/)){
                        subString = '"'+subString+'"';
                    }

                    line += subString+",";
                }
            }

            iniString += line.slice(0, -1)+"\n";
        }

        fse.writeFileSync(path.dirname(file)+"/_pony.ini", iniString );
        configPonies.push({
            ini:iniString,
            baseurl:"ponies/"+path.basename(path.dirname(file))+"/"
        })
    }

    fse.writeFileSync(IniPath+"/"+"config.json", JSON.stringify(configPonies));
    // console.log(configPonies);
}

function cleanName(name){
    return name
        .replace(/[%'\s"]+/g, "_") //replace %, quotes, spaces
        .replace(/_+/, "_"); // replace double _
}
var locationName = function (loc) {
    for (var name in Locations) {
        if (Locations[name] === loc) {
            return name;
        }
    }
    return "Not a Location";
};

gulp.task("repair-ponies", ()=>{
    log("start repairing ponies folder");

    repairPonies("./ponies" );

    repairIniFiles("./ponies");
});

gulp.task("convert-to-json", ["repair-ponies"], ()=>{
    let iniFiles = glob.sync("./ponies/**/_pony.ini");

    let configPonies = [];

    for (let i = 0; i < iniFiles.length; i++) {
        let file = iniFiles[i];
        let ini = PonyINI.parse(fse.readFileSync(file).toString());

        let pony = {
            behavior : {},
            effects : {},
            speeches : {},
            categories : [],
            behaviorgroups : []
        };
        let name = "";

        for (let j = 0; j < ini.length; j++) {
            let line = ini[j];
            switch(line[0]){
                case "Name":
                    name = line[1]
                break;
                case "Behavior":
                    pony.behavior[line[1]] = {
                        probability: parseFloat(line[2]),
                        maxduration: parseFloat(line[3]),
                        minduration: parseFloat(line[4]),
                        speed: parseFloat(line[5]),
                        rightimage: line[6],
                        leftimage: line[7],
                        movement: line[8],
                        effects:     [],
                        linked: line[9],
                        speakstart: line[10],
                        speakend: line[11],
                        skip: parseBoolean(line[12]),
                        x: line[13],
                        y: line[14],
                        follow: line[15],
                        auto_select_images: parseBoolean(line[16]) || true,
                        stopped: line[17],
                        moving: line[18],
                        rightcenter : parsePoint(line[19]),
                        leftcenter  : parsePoint(line[20]),
                        dont_repeat_animation : parseBoolean(line[21]) || false
                    }
                break;
                case "Effect":
                    var effect = {
                        behavior:    line[2],
                        rightimage:  encodeURIComponent(line[3]),
                        leftimage:   encodeURIComponent(line[4]),
                        duration:    Number(line[5]),
                        delay:       Number(line[6]),
                        rightloc:    line[7].trim(),
                        rightcenter: line[8].trim(),
                        leftloc:     line[9].trim(),
                        leftcenter:  line[10].trim(),
                        follow:      parseBoolean(line[11]),
                        dont_repeat_animation: line[12] ? parseBoolean(line[12]) : false
                    };
                    pony.effects[line[1]] = effect;
                    break;
                case "Speak":
                    speak = {
                        name: line[1],
                        text: line[2].trim(),
                        files : {},
                        skip  : parseBoolean(line[4]),
                        group : parseInt(line[5],10),
                    };

                    var files = line[3];
                    if (files) {
                        if (!Array.isArray(files)) files = [files];
                        if (files.length > 0) {
                            speak.files = {};
                            for (k = 0; k < files.length; ++ k) {
                                var soundFile = files[k];
                                var ext = /(?:\.([^\.]*))?$/.exec(soundFile)[1];
                                var filetype;
                                if (ext) {
                                    ext = ext.toLowerCase();
                                    filetype = AudioMimeTypes[ext] || 'audio/x-'+ext;
                                }
                                else {
                                    filetype = 'audio/x-unknown';
                                }
                                if (filetype in speak.files) {
                                    log().warn(baseurl+': file type '+filetype+
                                        ' of speak line '+speak.name+
                                        ' is not unique.');
                                }
                                speak.files[filetype] = encodeURIComponent(soundFile);
                            }
                        }
                    }
                    if ('group' in speak && isNaN(speak.group)) {
                        delete speak.group;
                        log().warn(baseurl+': speak line '+speak.name+
                            ' references illegal behavior group id: ',line[5]);
                    }

                    pony.speeches[line[1]] = speak;
                    break;

                case "behaviorgroup":
                    var group = parseInt(line[1],10);
                    if (isNaN(group)) {
                        log().warn(baseurl+': illegal behavior group id: ',line[1]);
                    }
                    else {
                        pony.behaviorgroups[group] = line[2];
                    }
                break;
                case "Categories":
                    pony.categories = pony.categories.concat(line.slice(1));
                    break;

                default:
                    log().warn(name+": Unknown pony setting:",line);
            }
        }

        fse.writeFileSync(path.dirname(file)+"/config.json", JSON.stringify(pony));
    }

})