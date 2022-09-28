
import * as THREE from 'https://cdn.skypack.dev/three@0.133.1';


function forceImpl (name) {
    throw `Importer child class needs to override ${name}!`;
}

// adapted from https://stackoverflow.com/a/67705873
function getTimestamp (unix) {
    const pad = (n,s=2) => (`${new Array(s).fill(0)}${n}`).slice(-s);
    const d = new Date();
    d.setTime(unix * 1000);
    return `${pad(d.getFullYear(),4)}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}


class Importer {
    #playingIdx = 0;
    dimension;

    _prepare () { forceImpl('_prepare'); }

    _rewind () { forceImpl('_rewind'); }

    _readNext () { forceImpl('_readNext'); }

    import (data, onSetDimension, onUpdateBoundaryGeo, onUpdateGeo, svgCtx, svgCanvas) {
        this.data = data;
        this._onSetDimension = onSetDimension;
        this._onUpdateBoundaryGeo = onUpdateBoundaryGeo;
        this._onUpdateGeo = onUpdateGeo;
        this._svgCtx = svgCtx;
        this._svgCanvas = svgCanvas;
        this._prepare();
        this.play();
    }

    exportSVG () {
        throw `No SVG to export!`;
    }

    async play () {
        const playingIdx = this.#playingIdx;
        this._rewind();
        while (true) {
            if (!this._readNext()) return;
            await new Promise(resolve => setTimeout(resolve, 5));
            if (playingIdx !== this.#playingIdx) {
                return;
            }
        }
    }

    stop () {
        ++this.#playingIdx;
    }

    _setDate (dateStr) {
        document.getElementById('date').innerHTML  = dateStr;
    }

    _setStats (stats) {
        document.getElementById('stats').innerHTML = `Seed: ${stats.seed ?? 'N/A'}<br/>
                                                      Dimension: ${this.dimension}D<br/>
                                                      Tris: ${stats.tris ?? 'N/A'}<br/>
                                                      Particles: ${stats.particles ?? 'N/A'}<br/>
                                                      Iterations: ${stats.iterations ?? 'N/A'}<br/>
                                                      Machine: ${stats.machine?.toLowerCase() ?? 'N/A'}<br/>
                                                      Runtime: ${typeof stats.runtime == 'number' ? stats.runtime + ' ms' : 'N/A'}<br/>
                                                      <hr/>
                                                      Attraction Magnitude: ${stats.attractionMagnitude ?? 'N/A'}<br/>
                                                      Repulsion Magnitude Factor: ${stats.repulsionMagnitudeFactor ?? 'N/A'}<br/>
                                                      Damping: ${stats.damping ?? 'N/A'}<br/>
                                                      Noise: ${stats.noise ?? 'N/A'}<br/>
                                                      Repulsion Anisotropy: ${stats.repulsionAnisotropy ?? 'N/A'}<br/>
                                                      Boundary type: ${stats.boundaryType ?? 'none'}<br/>
                                                      Growth strategy: ${stats.growthStrategy ?? 'unknown'}<br/>
                                                      Delta time: ${stats.deltaTime ?? 'N/A'}<br/>
                                                      Volume: ${stats.volume ?? 'unknown'}`;
    }

};

class JsonImporter extends Importer {
    #idx = 0;

    _prepare () {
        this.data = JSON.parse(this.data);
        if (!Array.isArray(this.data)) {
            this.data = [this.data];
        }
    }

    _rewind () {
        this.#idx = 0;
    }

    _readNext () {
        if (this.data.length <= this.#idx) return false;
        const surface = this.data[this.#idx++];
        
        // legacy files
        if (!('boundary' in surface)) surface.boundary = { type: 'sphere', radius: 1, extent: 0.05 };

        // display stats
        this.dimension = surface.dimension ?? 3;
        this._onSetDimension(this.dimension);
        this._setDate(getTimestamp(surface.date));
        this._setStats({
            seed: surface.seed ?? null,
            tris: surface.triangles?.length ?? null,
            particles: surface.particles?.length ?? null,
            iterations: surface.timesteps ?? null,
            machine: surface.machine ?? null,
            runtime: surface.runtime ?? null,
            attractionMagnitude: surface.attractionMagnitude ?? null,
            repulsionMagnitudeFactor: surface.repulsionMagnitudeFactor ?? null,
            damping: surface.damping ?? null,
            noise: surface.noise ?? null,
            repulsionAnisotropy: surface.repulsionAnisotropy ?? null,
            boundaryType: surface.boundary?.type ?? null,
            growthStrategy: surface.growthStrategy ?? null,
            deltaTime: surface.dt ?? null,
            volume: surface.volume ?? null
        });

        if (this.dimension == 3) {

            this._onUpdateBoundaryGeo(
                surface.boundary === null ? new THREE.BufferGeometry :
                surface.boundary.type === 'cylinder' ? new THREE.CylinderGeometry(surface.boundary.radius, surface.boundary.radius, 100, 32, 320, true).rotateX(Math.PI / 2) :
                surface.boundary.type === 'sphere' ? new THREE.IcosahedronGeometry(surface.boundary.radius, 8) : (() => { throw `Unknown boundary type ${surface.boundary.type}!`; })()
            );
            
            // build up geometry
            const vertices = [];
            const indices = [];
            for (const tri of surface.triangles) {
                indices.push(tri[0], tri[1], tri[2]);
            }
            for (const vert of surface.particles) {
                vertices.push(vert.position[0], vert.position[1], vert.position[2]);
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
            geo.setIndex(indices);
            geo.computeVertexNormals();
            this._onUpdateGeo(geo);
        } else {

            const svgCtx = this._svgCtx;
            const svgCanvas = this._svgCanvas;

            svgCtx.clearRect(0, 0, svgCanvas.width, svgCanvas.height);
                
            if (surface.boundary !== null) {
                switch (surface.boundary.type) {
                    case 'sphere':
                        svgCtx.fillStyle = '#666';
                        svgCtx.strokeStyle = '#111';
                        svgCtx.beginPath();
                        svgCtx.arc(svgCanvas.width/2, svgCanvas.height/2, svgCanvas.width * surface.boundary.radius * 0.5 * 0.9, 0, 2 * Math.PI);
                        svgCtx.fill();
                        svgCtx.stroke();
                        break;
                    default:
                        console.error('Unknown boundary type for boundary', surface.boundary, '!');
                }
            }
            
            svgCtx.fillStyle = '#fff';
            svgCtx.strokeStyle = '#000';
            let path = 'M ';
            let current = 0;
            do {
                let point = surface.particles[current];
                path += parseInt((point.position[0] * 0.5 * 0.9 + 0.5) * svgCanvas.width) + ' ' + parseInt((point.position[1] * 0.5 * 0.9 + 0.5) * svgCanvas.height) + ' ';
                current = point.next;
                if (current == 0) path += 'Z';
                else path += 'L ';
            } while (current != 0);
            svgCtx.fill(new Path2D(path));
            svgCtx.stroke(new Path2D(path));

            this.exportSVG = () => {
                const sz = 8192;
                let svg = `
                    <svg width='${sz}' height='${sz}' xmlns='http://www.w3.org/2000/svg'>
                        <path d='M 0 0 h ${sz} v ${sz} h ${-sz} Z' fill='white' />
                `;
                const points = [];
                let current = 0;
                do {
                    points.push(surface.particles[current].position);
                    current = surface.particles[current].next;
                } while (current != 0);
                svg += `<path
                            d='M ${points.map(p => `${parseInt((p[0] * 0.5 * 0.9 + 0.5) * sz)} ${parseInt((p[1] * 0.5 * 0.9 + 0.5) * sz)}`).join(' L ')} Z'
                            fill='black'
                        />`
                svg += `</svg>`;
                return svg;
            };

        }

        return true;
    }

};

class BinaryImporter extends Importer {
    #idx = 0;
    #floatView = new DataView(new ArrayBuffer(4));
    #doubleView = new DataView(new ArrayBuffer(8));

    _prepare () {
        this.data = new Uint8Array(this.data);
    }

    _rewind () {
        this.#idx = 0;
    }

    #byte () {
        if (this.#idx >= this.data.length) throw `Out of bounds, cannot read next byte!`;
        return this.data[this.#idx++];
    }

    #char () {
        return String.fromCharCode(this.#byte());
    }

    #int (bits = 32) {
        let val = 0;
        for (let i = 0; i < bits / 8; ++i) {
            val |= this.#byte() << (8 * i);
        }
        return val;
    }

    #float () {
        for (let i = 0; i < 4; ++i) {
            this.#floatView.setUint8(3 - i, this.#byte());
        }
        return this.#floatView.getFloat32();
    }

    #double () {
        for (let i = 0; i < 8; ++i) {
            this.#doubleView.setUint8(7 - i, this.#byte());
        }
        return this.#doubleView.getFloat64();
    }

    #vec(dim = 3) {
        const result = [];
        for (let i = 0; i < dim; ++i) {
            result.push(this.#float());
        }
        return result;
    }

    #ivec(dim = 3) {
        const result = [];
        for (let i = 0; i < dim; ++i) {
            result.push(this.#int());
        }
        return result;
    }

    #string () {
        let str = '';
        while (true) {
            const c = this.#char();
            if (c == '\0') return str;
            str += c;
        }
    }

    _readNext () {
        if (this.#idx >= this.data.length) return false;
        
        let fileVersion = 0;

        // read header
        let header = '' + this.#char();
        header += this.#char();
        header += this.#char();
        if (header == 'SRF') { // old files start with SRF and do not contain the file version
            fileVersion = 0;
        } else if (header == 'SEL') { // new files start with SEL and contain the file version as a single byte
            fileVersion = this.#byte();
        } else {
            throw `Invalid header '${header}' != 'SEL' (and != 'SRF') at location ${this.#idx-3}, file is not a valid binary surface!`;
        }

        // read metadata
        this.dimension = this.#byte();
        this._onSetDimension(this.dimension);
        this._setDate(getTimestamp(this.#int(64)));
        const machine = this.#string();
        const seed = this.#int();
        const iterations = this.#int();
        const attractionMagnitude = this.#float();
        const repulsionMagnitudeFactor = this.#float();
        const damping = this.#float();
        const noise = this.#float();
        const repulsionAnisotropy = this.#vec(this.dimension);
        const deltaTime = this.#float();
        const runtime = this.#int();
        const volume = fileVersion < 1 ? null : this.#float();
        const numParticles = this.#int();

        // Read particle positions
        const particles = [];
        for (let i = 0; i < numParticles; ++i) {
            const particle = { position: this.#vec(this.dimension) };
            if (this.dimension == 2) {
                particle.next = this.#int();
            }
            particles.push(particle);
        }

        // Read triangle indices
        let numTriangles = null;
        const triangles = [];
        if (this.dimension == 3) {
            numTriangles = this.#int();
            for (let i = 0; i < numTriangles; ++i) {
                triangles.push(this.#ivec(3));
            }
        }

        // Check final byte
        if (this.#byte() !== 0) {
            throw `Invalid footer, binary data should end each surface with a 0x00!`;
        }
        
        // update statistics
        this._setStats({
            seed: seed,
            tris: numTriangles,
            particles: numParticles,
            iterations: iterations,
            machine: machine,
            runtime: runtime,
            attractionMagnitude: attractionMagnitude,
            repulsionMagnitudeFactor: repulsionMagnitudeFactor,
            damping: damping,
            noise: noise,
            repulsionAnisotropy: repulsionAnisotropy,
            boundaryType: null,
            growthStrategy: null,
            deltaTime: deltaTime,
            volume: volume
        });
        
        // Display the surface
        if (this.dimension == 3) {

            this._onUpdateBoundaryGeo(new THREE.BufferGeometry); // no boundary shown when loading in a binary file - @todo
            
            // build up geometry
            const vertices = [];
            const indices = [];
            for (const tri of triangles) {
                indices.push(tri[0], tri[1], tri[2]);
            }
            for (const vert of particles) {
                vertices.push(vert.position[0], vert.position[1], vert.position[2]);
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
            geo.setIndex(indices);
            geo.computeVertexNormals();
            this._onUpdateGeo(geo);
        } else {

            const svgCtx = this._svgCtx;
            const svgCanvas = this._svgCanvas;

            svgCtx.clearRect(0, 0, svgCanvas.width, svgCanvas.height);
                
            // @todo - no boundary shown
            
            svgCtx.fillStyle = '#fff';
            svgCtx.strokeStyle = '#000';
            let path = 'M ';
            let current = 0;
            do {
                let point = particles[current];
                path += parseInt((point.position[0] * 0.5 * 0.9 + 0.5) * svgCanvas.width) + ' ' + parseInt((point.position[1] * 0.5 * 0.9 + 0.5) * svgCanvas.height) + ' ';
                current = point.next;
                if (current == 0) path += 'Z';
                else path += 'L ';
            } while (current != 0);
            svgCtx.fill(new Path2D(path));
            svgCtx.stroke(new Path2D(path));

            this.exportSVG = () => {
                const sz = 8192;
                let svg = `
                    <svg width='${sz}' height='${sz}' xmlns='http://www.w3.org/2000/svg'>
                        <path d='M 0 0 h ${sz} v ${sz} h ${-sz} Z' fill='white' />
                `;
                const points = [];
                let current = 0;
                do {
                    points.push(surface.particles[current].position);
                    current = surface.particles[current].next;
                } while (current != 0);
                svg += `<path
                            d='M ${points.map(p => `${parseInt((p[0] * 0.5 * 0.9 + 0.5) * sz)} ${parseInt((p[1] * 0.5 * 0.9 + 0.5) * sz)}`).join(' L ')} Z'
                            fill='black'
                        />`
                svg += `</svg>`;
                return svg;
            };

        }

        return true;
    }

};

export { JsonImporter, BinaryImporter };
