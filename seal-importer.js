
import * as THREE from 'https://cdn.skypack.dev/three@0.133.1';
import { mergeBufferGeometries } from './BufferGeometryUtils.js';


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

// @todo: json importer doesn't support trees yet
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
    
    #intArray (bits = 32) {
        let arr = [];
        const sz = this.#int(32);
        for (let i = 0; i < sz; ++i) {
            arr.push(this.#int(bits));
        }
        return arr;
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
        const type = fileVersion < 2 ? ('s' + this.dimension) : this.#string();
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
            if (type.startsWith('t')) {
                // trees (n-dim): multiple neighbours per particle
                particle.neighbours = this.#intArray();
            } else if (this.dimension == 2) {
                // line: single neighbour
                particle.next = this.#int();
            }
            particles.push(particle);
        }

        // Read triangle indices (only 3D non-trees)
        let numTriangles = null;
        const triangles = [];
        if (this.dimension == 3 && !type.startsWith('t')) {
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
            if (type.startsWith('t')) { // tree
                
                const geos = [];
                const radius = attractionMagnitude * repulsionMagnitudeFactor * 0.25; // 25% of the typical distance between non-neighbour particles, i.e. 50% will be air and 50% volume
                const atov = arr => new THREE.Vector3(arr[0], arr[1], arr[2]);
                for (let i = 0; i < particles.length; ++i) {
                    const from = atov(particles[i].position);
                    // insert node
                    const sphere = new THREE.SphereGeometry(radius, 6, 3);
                    sphere.translate(from.x, from.y, from.z);
                    geos.push(sphere);
                    for (let j of particles[i].neighbours) {
                        const to = atov(particles[j].position);
                        // insert from-to line
                        geos.push(new THREE.TubeGeometry(new THREE.LineCurve3(from, to), 1, radius, 6, false));
                    }
                }
                const geo = mergeBufferGeometries(geos);
                geo.computeVertexNormals();
                this._onUpdateGeo(geo);
                
            } else { // surface
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
            }
        } else {

            const svgCtx = this._svgCtx;
            const svgCanvas = this._svgCanvas;

            svgCtx.clearRect(0, 0, svgCanvas.width, svgCanvas.height);
                
            // @todo - no boundary shown
            
            if (type.startsWith('t')) {
                // tree (graph)
                svgCtx.fillStyle = '#888';
                svgCtx.strokeStyle = '#000';
                for (let i = 0; i < particles.length; ++i) {
                    svgCtx.beginPath();
                    svgCtx.ellipse((particles[i].position[0] * 0.5 * 0.9 + 0.5) * svgCanvas.width, (particles[i].position[1] * 0.5 * 0.9 + 0.5) * svgCanvas.height, 0.003 * svgCanvas.width, 0.003 * svgCanvas.height, 2*Math.PI, 0, 2*Math.PI);
                    svgCtx.fill();
                }
                for (let i = 0; i < particles.length; ++i) {
                    const from = parseInt((particles[i].position[0] * 0.5 * 0.9 + 0.5) * svgCanvas.width) + ' ' + parseInt((particles[i].position[1] * 0.5 * 0.9 + 0.5) * svgCanvas.height);
                    for (let j of particles[i].neighbours) {
                        const to = parseInt((particles[j].position[0] * 0.5 * 0.9 + 0.5) * svgCanvas.width) + ' ' + parseInt((particles[j].position[1] * 0.5 * 0.9 + 0.5) * svgCanvas.height);
                        svgCtx.stroke(new Path2D(`M ${from} L ${to}`));
                    }
                }
            } else {
                // 'surface' (i.e. continuous line)
                let current = 0;
                let path = 'M ';
                svgCtx.fillStyle = '#fff';
                svgCtx.strokeStyle = '#000';
                do {
                    let point = particles[current];
                    path += parseInt((point.position[0] * 0.5 * 0.9 + 0.5) * svgCanvas.width) + ' ' + parseInt((point.position[1] * 0.5 * 0.9 + 0.5) * svgCanvas.height) + ' ';
                    current = point.next;
                    if (current == 0) path += 'Z';
                    else path += 'L ';
                } while (current != 0);
                // (no fill for trees)
                svgCtx.fill(new Path2D(path));
                svgCtx.stroke(new Path2D(path));
            }
            
            this.exportSVG = () => {
                const sz = 1024;
                let svg = `
                    <svg width='${sz}' height='${sz}' xmlns='http://www.w3.org/2000/svg'>
                        <path d='M 0 0 h ${sz} v ${sz} h ${-sz} Z' fill='lightblue' />
                `;
                if (type.startsWith('t')) {
                    // tree
                    const showSkeleton = true;
                    for (let i = 0; i < particles.length; ++i) {
                        const from = ((particles[i].position[0] * 0.5 * 0.9 + 0.5) * sz) + ' ' + ((particles[i].position[1] * 0.5 * 0.9 + 0.5) * sz);
                        for (let j of particles[i].neighbours) {
                            const to = ((particles[j].position[0] * 0.5 * 0.9 + 0.5) * sz) + ' ' + ((particles[j].position[1] * 0.5 * 0.9 + 0.5) * sz);
                            svg += `<path
                                        d='M ${from} L ${to}'
                                        stroke='white'
                                        fill='none'
                                        stroke-width='5'
                                        stroke-linejoin='round'
                                        stroke-linecap='round'
                                    />`;
                        }
                    }
                    if (showSkeleton) {
                        for (let i = 0; i < particles.length; ++i) {
                            const from = ((particles[i].position[0] * 0.5 * 0.9 + 0.5) * sz) + ' ' + ((particles[i].position[1] * 0.5 * 0.9 + 0.5) * sz);
                            for (let j of particles[i].neighbours) {
                                const to = ((particles[j].position[0] * 0.5 * 0.9 + 0.5) * sz) + ' ' + ((particles[j].position[1] * 0.5 * 0.9 + 0.5) * sz);
                                svg += `<path
                                            d='M ${from} L ${to}'
                                            stroke='black'
                                            fill='none'
                                            stroke-width='0.5'
                                        />`;
                            }
                        }
                        for (let i = 0; i < particles.length; ++i) {
                            svg += `<ellipse cx="${((particles[i].position[0] * 0.5 * 0.9 + 0.5) * sz)}" cy="${((particles[i].position[1] * 0.5 * 0.9 + 0.5) * sz)}" rx="1" ry="1" fill="black" stroke="none" />`;
                        }
                    }
                } else {
                    // surface
                    const points = [];
                    let current = 0;
                    do {
                        points.push(particles[current].position);
                        current = particles[current].next;
                    } while (current != 0);
                    svg += `<path
                                d='M ${points.map(p => `${parseInt((p[0] * 0.5 * 0.9 + 0.5) * sz)} ${parseInt((p[1] * 0.5 * 0.9 + 0.5) * sz)}`).join(' L ')} Z'
                                fill='white'
                            />`
                }
                svg += `</svg>`;
                return svg;
            };
            
        }

        return true;
    }

};

export { JsonImporter, BinaryImporter };
