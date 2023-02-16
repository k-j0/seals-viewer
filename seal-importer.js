
import * as THREE from './libs/three.js';
import { mergeBufferGeometries } from './BufferGeometryUtils.js';


const QUICK_MODE = (new URLSearchParams(window.location.search)).has('quick');


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
            if (!QUICK_MODE) await new Promise(requestAnimationFrame);//resolve => setTimeout(resolve, 1));
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
                                                      Volume: ${stats.volume ?? 'unknown'}<br/>
                                                      Volume fraction: ${stats.volumeFraction ?? 'unknown'}`;
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
        
        if ('refine' in this) delete this.refine;
        
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
        
        // Read boundary, if defined in the file
        const hasBoundary = fileVersion < 4 ? false : this.#int(8);
        let boundary = null;
        if (hasBoundary) {
            const boundaryType = this.#int(8);
            if (boundaryType == 0) { // sphere
                const radius = this.#float();
                const extent = this.#float();
                const withOffset = fileVersion < 5 ? false : this.#byte() == 1;
                boundary = { type: 'sphere', radius: radius, extent: extent, volume: Math.PI * radius * radius, withOffset };
            } else if (boundaryType == 1) { // cylinder
                const radius = this.#float();
                const extent = this.#float();
                const withOffset = false;
                boudnary = { type: 'cylinder', radius: radius, extent: extent, volume: Math.PI * radius * radius /* assuming height = 1 */, withOffset };
            } else {
                throw new Error(`Unsupported boundary type found in binary file: ${boundaryType}.`);
            }
        }
        
        // Read particle positions
        const numParticles = this.#int();
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
        
        // Read 'young' node indices (only trees, after file version 3)
        let youngIndices = [];
        if (fileVersion >= 3 && type.startsWith('t')) {
            const numYIdx = this.#int();
            for (let i = 0; i < numYIdx; ++i) {
                const youngIndex = this.#int();
                youngIndices.push(youngIndex);
            }
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
        
        if (QUICK_MODE && this.#idx < this.data.length) {
            return true;
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
            volume: volume,
            boundaryType: boundary ? `${boundary.type} [volume: ${boundary.volume}]` : null,
            volumeFraction: boundary && volume ? volume / boundary.volume : null
        });
        
        // Display the surface
        if (this.dimension == 3) {

            this._onUpdateBoundaryGeo(
                boundary === null ? new THREE.BufferGeometry :
                boundary.type === 'cylinder' ? new THREE.CylinderGeometry(boundary.radius, boundary.radius, 100, 32, 320, true).rotateX(Math.PI / 2) :
                boundary.type === 'sphere' ? new THREE.IcosahedronGeometry(boundary.radius, 8) : (() => { throw `Unknown boundary type ${boundary.type}!`; })()
            );
            
            // build up geometry
            if (type.startsWith('t')) { // tree
                
                // Simple display with lines
                const positions = [];
                for (let i = 0; i < particles.length; ++i) {
                    const from = particles[i].position;
                    for (let j of particles[i].neighbours) {
                        const to = particles[j].position;
                        positions.push(from[0], from[1], from[2], to[0], to[1], to[2]);
                    }
                }
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
                this._onUpdateGeo(geo, 'lines');
                
                // More complex geometry display with thickness
                this.refine = () => {
                    
                    const geos = [];
                    const radius = attractionMagnitude * repulsionMagnitudeFactor * 0.4; // 40% of the typical distance between non-neighbour particles, i.e. 20% will be air and 80% volume
                    const segments = 12;
                    const atov = arr => new THREE.Vector3(arr[0], arr[1], arr[2]);
                    for (let i = 0; i < particles.length; ++i) {
                        const from = atov(particles[i].position);
                        for (let j of particles[i].neighbours) {
                            const to = atov(particles[j].position);
                            // insert from-to line
                            const cylinder = new THREE.CylinderGeometry(radius, radius, from.distanceTo(to), segments, 1, true);
                            const centre = from.clone().add(to).multiplyScalar(0.5);
                            cylinder.rotateX(Math.PI * 0.5);
                            cylinder.lookAt(to.clone().sub(from));
                            cylinder.translate(centre.x, centre.y, centre.z);
                            geos.push(cylinder);
                            // insert end caps
                            const sphere = new THREE.SphereGeometry(radius, segments, segments/2);
                            sphere.lookAt(to.clone().sub(from));
                            sphere.translate(from.x, from.y, from.z);
                            geos.push(sphere);
                            const toTo = to.clone().sub(from);
                            geos.push(sphere.clone().translate(toTo.x, toTo.y, toTo.z));
                        }
                    }
                    const geo = mergeBufferGeometries(geos);
                    geo.computeVertexNormals();
                    this._onUpdateGeo(geo);
                    
                };
                
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
            svgCtx.lineCap = 'round';
            
            const pos = (x) => (x * 0.8 + 0.5) * svgCanvas.width;
            
            if (boundary !== null) {
                switch (boundary.type) {
                    case 'sphere':
                        svgCtx.fillStyle = "#fff5";
                        svgCtx.strokeStyle = '#000';
                        svgCtx.beginPath();
                        svgCtx.arc(pos(0), pos(0), svgCanvas.width * boundary.radius * 0.8, 0, 2 * Math.PI);
                        svgCtx.fill();
                        svgCtx.stroke();
                        break;
                    default:
                        console.error('Unknown boundary type for boundary', boundary, '!');
                }
            }
            
            if (type.startsWith('t')) {
                // tree (graph)
                
                svgCtx.strokeStyle = '#aaa';
                svgCtx.lineWidth = 0.004 * 2 * svgCanvas.width;
                for (let i = 0; i < particles.length; ++i) {
                    const from = pos(particles[i].position[0]) + ' ' + pos(particles[i].position[1]);
                    for (let j of particles[i].neighbours) {
                        const to = pos(particles[j].position[0]) + ' ' + pos(particles[j].position[1]);
                        svgCtx.stroke(new Path2D(`M ${from} L ${to}`));
                    }
                }
                svgCtx.strokeStyle = '#333';
                svgCtx.lineWidth = 1;
                const youngs = new Set(youngIndices);
                for (let i = 0; i < particles.length; ++i) {
                    svgCtx.beginPath();
                    svgCtx.fillStyle = i == 0 ? '#ff0' : youngs.has(i) ? '#999' : '#666';
                    svgCtx.ellipse(pos(particles[i].position[0]), pos(particles[i].position[1]), 0.004 * svgCanvas.width, 0.004 * svgCanvas.height, 2*Math.PI, 0, 2*Math.PI);
                    svgCtx.fill();
                    svgCtx.stroke();
                }
                svgCtx.strokeStyle = '#fff';
                for (let i = 0; i < particles.length; ++i) {
                    const from = pos(particles[i].position[0]) + ' ' + pos(particles[i].position[1]);
                    for (let j of particles[i].neighbours) {
                        const to = pos(particles[j].position[0]) + ' ' + pos(particles[j].position[1]);
                        svgCtx.stroke(new Path2D(`M ${from} L ${to}`));
                    }
                }
                
                this.analyse = () => {
                    
                    // Horton-Strahler branch complexities
                    for (let i = 0; i < particles.length; ++i) {
                        particles[i].hsComplexity = -1;
                    }
                    const remainingIndices = new Set(Array(particles.length).keys());
                    const leafNodesFrom = (i, from = -1) => {
                        let nodes = [i];
                        for (const j of particles[i].neighbours) {
                            if (!remainingIndices.has(j)) continue;
                            if (j == from) continue;
                            let numNeighbours = 0;
                            for (const k of particles[j].neighbours) {
                                if (!remainingIndices.has(k)) continue;
                                ++numNeighbours;
                            }
                            if (numNeighbours > 2) continue; // not part of the same leaf anymore if it's a branching point
                            nodes = nodes.concat(leafNodesFrom(j, i));
                        }
                        return nodes;
                    };
                    while (remainingIndices.size > 0) {
                        console.group('Remaining: ', remainingIndices.size);
                        // remove all leaf branches
                        const markedForDeletion = new Set;
                        for (const i of remainingIndices) {
                            ++particles[i].hsComplexity;
                            
                            // determines whether the first particle should be assumed attached - if not
                            if (i == 0 && remainingIndices.size > 1) {
                                continue;
                            }
                            
                            let numNeighbours = 0;
                            for (const j of particles[i].neighbours) {
                                if (remainingIndices.has(j)) {
                                    ++numNeighbours;
                                }
                            }
                            if (numNeighbours <= 1) {
                                // tip of leaf node, mark for deletion up until next branching point
                                const leafNodes = leafNodesFrom(i);
                                for (const j of leafNodes) {
                                    markedForDeletion.add(j);
                                }
                            }
                        }
                        for (const i of markedForDeletion) {
                            remainingIndices.delete(i);
                        }
                        console.log('Removed', markedForDeletion.size);
                        console.groupEnd();
                        if (markedForDeletion.length <= 0) {
                            console.error('Step of H-S complexity computation ended up with no nodes to delete for the next level, but ' + remainingIndices.size + ' indices remain...!');
                            break;
                        }
                    }
                    
                    // Display H-S BCs
                    const colours = [
                        '#0099ff',
                        '#00ff73',
                        '#b3ff00',
                        '#ffee00',
                        '#ff7b00',
                        '#ff0000',
                        '#ffffff'
                    ];
                    colours.default = 'magenta';
                    colours[-1] = 'white';
                    svgCtx.fillStyle = '#001';
                    svgCtx.fillRect(0, 0, svgCanvas.width, svgCanvas.height);
                    svgCtx.strokeStyle = '#444';
                    svgCtx.lineWidth = 0.004 * 2 * svgCanvas.width;
                    for (let i = 0; i < particles.length; ++i) {
                        const from = pos(particles[i].position[0]) + ' ' + pos(particles[i].position[1]);
                        for (let j of particles[i].neighbours) {
                            const to = pos(particles[j].position[0]) + ' ' + pos(particles[j].position[1]);
                            svgCtx.stroke(new Path2D(`M ${from} L ${to}`));
                        }
                    }
                    svgCtx.strokeStyle = '#333';
                    svgCtx.lineWidth = 1;
                    const youngs = new Set(youngIndices);
                    for (let i = 0; i < particles.length; ++i) {
                        svgCtx.beginPath();
                        svgCtx.fillStyle = youngs.has(i) ? '#bbb' : '#999';
                        svgCtx.ellipse(pos(particles[i].position[0]), pos(particles[i].position[1]), 0.004 * svgCanvas.width, 0.004 * svgCanvas.height, 2*Math.PI, 0, 2*Math.PI);
                        svgCtx.fill();
                        svgCtx.stroke();
                    }
                    svgCtx.lineWidth = 1.5;
                    for (let i = 0; i < particles.length; ++i) {
                        const from = pos(particles[i].position[0]) + ' ' + pos(particles[i].position[1]);
                        for (let j of particles[i].neighbours) {
                            
                            // Horton-Strahler complexity of the branch as the lowest among the two nodes
                            const hsComplexity = Math.min(particles[i].hsComplexity, particles[j].hsComplexity);
                            
                            const to = pos(particles[j].position[0]) + ' ' + pos(particles[j].position[1]);
                            svgCtx.strokeStyle = colours[hsComplexity >= colours.length ? 'default' : hsComplexity];
                            svgCtx.stroke(new Path2D(`M ${from} L ${to}`));
                        }
                    }
                    
                };
                
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
                        <path d='M 0 0 h ${sz} v ${sz} h ${-sz} Z' fill='black' />
                `;
                if (type.startsWith('t')) {
                    // tree
                    const showSkeleton = false;
                    for (let i = 0; i < particles.length; ++i) {
                        const from = ((particles[i].position[0] * 0.5 * 0.9 + 0.5) * sz) + ' ' + ((particles[i].position[1] * 0.5 * 0.9 + 0.5) * sz);
                        for (let j of particles[i].neighbours) {
                            const to = ((particles[j].position[0] * 0.5 * 0.9 + 0.5) * sz) + ' ' + ((particles[j].position[1] * 0.5 * 0.9 + 0.5) * sz);
                            svg += `<path
                                        d='M ${from} L ${to}'
                                        stroke='white'
                                        fill='none'
                                        stroke-width='1.5'
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
