const express = require('express');
const app = express();
const fs = require('fs');
const bodyParser = require('body-parser');
const { response } = require('express');
const config = (() => {
    try {
        return require('./config.json');
    } catch {
        fs.writeFileSync('./config.json', '{"port": 1337}');
        return {port: 1337};
    }
})();

//holly shift
app.use(express.static(__dirname + '/public'));
app.disable('x-powered-by');
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
let timeout_music;

if(config.radio) {
    console.log("RADIO ON");
    const __ffmpeg = require('fluent-ffmpeg');
    const lame = require('@suldashi/lame');
    const {Readable} = require('stream');
    const __GetData = async function(path) {
        return new Promise(resolve => {
            __ffmpeg.ffprobe(path, (err, data) => {
                resolve(err ? Buffer.from('nah') : data);
            });
        });
    }

    var song;
    var songs = [];
    function __randomSort() {
        let oldPos = songs.indexOf(song);
        let NewPos = Math.floor(Math.random() * songs.length);
        while(oldPos > -1 && NewPos == oldPos)
        	NewPos = Math.floor(Math.random() * songs.length);
        song = songs[NewPos];
        return song;
    }

    function __listSort() {
        let p = songs.indexOf(song);
        if(++p >= songs.length)
            p = 0;
        song = songs[p];
        return song;
    }

    var methodSort = __listSort;
    var listeners = new Set();
    
    const stream = new Readable();
    stream._read = function(size) {
        if (this.data.length) {
            const chunk = this.data.slice(0, size);
            this.data = this.data.slice(size, this.data.length);               
            this.push(chunk);        
        } else {
            this.push(Buffer.from('nah')); // I no have data, because I must do streaming!
        }
    };

    const encoder = lame.Encoder({
        channels: 2,
        bitDepth: 16,
        sampleRate: 44100,
    });

    async function workerDJ() {
        while(1)
        {
            //re-search songs
            songs = [];
            for(const path of fs.readdirSync('./public/music'))
            {
                songs.push({
                    path,
                    fdata: await __GetData('./public/music/' + path) 
                });
            }
            // player
            methodSort()
            for(let played = 0; played < Math.pow(songs.length, 1.2); methodSort(), ++played)
            {
                // const stream = fs.createReadStream('./public/music/' + song.path);
                const decoder = lame.Decoder();
                decoder.on('format', () => {
                    decoder.on('data', data => {
                    	encoder.write(data);
                    });
                });
                let data = fs.readFileSync('./public/music/' + song.path);
                song.buffer = data;
                decoder.write(data);
                song.started = Date.now();
                console.log(song);
                await (new Promise(res => timeout_music = setTimeout(res, Math.trunc((song.fdata.format.duration-1)*1000), 0)));
            	song.started = 0;
            	decoder.removeAllListeners();
            	delete song.buffer;
            }
        }
    }

    encoder.on('data', chunk => {
        for(const stream of listeners)
            stream.write(chunk);
    });

    app.get('/radio', async (req, res) => {
    	console.log(`open ${req.connection.remoteAddress}`);
        response.writeHead(200, { "Content-Type": "audio/mp3", "Connection": "close", "Transfer-Encoding": "identity"});
        res.on('close', () => {
        	console.log(`close ${req.connection.remoteAddress}`);
            listeners.delete(res);
        });
        if(song) {
	        if(song.started && song.buffer)
	        {
	        	const decoder = lame.Decoder();
	        	const encoder = lame.Encoder({
			        channels: 2,
			        bitDepth: 16,
			        sampleRate: 44100,
			    });
			    encoder.on('data', data => {
			    	res.write(data);
			    });
			    decoder.pipe(encoder);
			    decoder.write(song.buffer.slice( song.fdata.format.bit_rate/8 * (Date.now() - song.started)/1000 ));
			    await (new Promise(res => setTimeout(res, song.fdata.format.duration*1000-(Date.now()-song.started), 0)))
	        }
	        else if(song.started && encoder._transformState.writechunk && encoder._transformState.writechunk.length)
	            res.write(encoder._transformState.writechunk);
	    }
        listeners.add(res);
    });

    app.get('/api/changeMethodSort', (req, res) => {
        methodSort = methodSort === __listSort ? __randomSort : __listSort;
        res.send('ok, dude.');
    });

    app.get('/api/skip', (req, res) => {
    	if(timeout_music)
    	{
    		let f = timeout_music._onTimeout;
    		timeout_music.close();
    		f();
    		res.send("ok");
    	} else res.send('what?');
    });

    workerDJ();
}

app.listen(config.port, () => { console.log('::' + config.port); })

app.get('/:v?', (req, res) => {
	let stat;
	console.log(req.path);
	try {
		stat = fs.statSync('./public'+req.path);
	} catch (e){
		return res.send(JSON.stringify(e, undefined, ' '));
	}
	if(stat.isDirectory)
		res.send( 
			fs.readdirSync('./public' + req.path)
				.map(path => `<a href="http://${req.hostname}:${config.port}${req.path + path}">${req.path + path}</a>`)
				.join('<br/>')
			);
	else
		res.sendFile('./public/' + req.path);
});
