
import * as THREE from 'https://cdn.skypack.dev/three@0.133.1';


// Outputs list of vertices ordered by number of connections and average connected triangle area
function sharedVertices (surface, div) {
    
    // compute average areas
    const verts = surface.particles;
    for (const tri of surface.triangles) {
        const a = verts[tri[0]];
        const b = verts[tri[1]];
        const c = verts[tri[2]];
        const ab = new THREE.Vector3(b.position[0] - a.position[0], b.position[1] - a.position[1], b.position[2] - a.position[2]);
        const ac = new THREE.Vector3(c.position[0] - a.position[0], c.position[1] - a.position[1], c.position[2] - a.position[2]);
        const area = ab.cross(ac).length() * 0.5;
        a.totalArea = (a.totalArea || 0) + area;
        b.totalArea = (b.totalArea || 0) + area;
        c.totalArea = (c.totalArea || 0) + area;
        a.numTris = (a.numTris || 0) + 1;
        b.numTris = (b.numTris || 0) + 1;
        c.numTris = (c.numTris || 0) + 1;
    }
    const areas = new Map();
    for (const v of verts) {
        v.totalArea /= v.numTris;
        const info = areas.has(v.numTris) ? areas.get(v.numTris) : { avg:0, num:0 };
        areas.set(v.numTris, { avg: info.avg + v.totalArea, num: info.num + 1 });
    }
    const results = [...areas].map(a => { return { tris: a[0], area: a[1].avg / a[1].num }; })
                              .sort((a, b) => a.tris - b.tris);
    // add entries for points without any vertices sharing X tris (with area = null)
    for (let i = results[0].tris, max = results[results.length - 1].tris; i < max; ++i) {
        let has = false;
        for (let j = 0; j < results.length; ++j) {
            if (results[j].tris == i) has = true;
        }
        if (!has) {
            results.push({ tris: i, area: null });
        }
    }
    results.sort((a, b) => a.tris - b.tris);
    
    // display with ChartJS
    const canvas = document.createElement('canvas');
    const container = document.createElement('div');
    div.append(container);
    container.style.width = window.innerWidth * 0.4 + 'px';
    container.style.height = window.innerWidth * 0.2 + 'px';
    container.append(canvas);
    Chart.defaults.color = 'white';
    new Chart(canvas, {
        type: 'scatter',
        data: {
            labels: results.map(a => a.tris),
            datasets: [{
                label: 'Average area shared by vertices among tris',
                backgroundColor: 'white',
                data: results.map(a => a.area)
            }]
        },
        options: {}
    });
}

// Outputs fractal dimension for 2D line
function fractalDimension2D (line, div, svgCtx, svgCanvas) {
    
    const display = false; // turn to true to display a single sample on the svg canvas
    const numSamples = display ? 1 : 5000;
    const groupAverages = false;
    const groupSize = 0.0075;
    
    
    // sample euclidean and walk distance from 2 points, numSamples times
    function euclideanDist (a, b) {
        const xdiff = line.particles[a].position[0] - line.particles[b].position[0];
        const ydiff = line.particles[a].position[1] - line.particles[b].position[1];
        return Math.sqrt(xdiff * xdiff + ydiff * ydiff);
    }
    function toSvgPos (x) {
        return parseInt((x * 0.5 * 0.9 + 0.5) * svgCanvas.width);
    }
    function drawPt (i, fill, stroke) {
        svgCtx.fillStyle = fill;
        svgCtx.strokeStyle = stroke;
        svgCtx.beginPath();
        svgCtx.arc(toSvgPos(line.particles[i].position[0]), toSvgPos(line.particles[i].position[1]), 2, 0, 2 * Math.PI);
        svgCtx.fill();
        svgCtx.stroke();
    }
    
    // returns { euclidean: ..., geodesic: ... } distances between two points
    function distances (a, b) {
        // euclidean distance
        const euclidean = euclideanDist(a, b);
        
        // walk distance, right
        let right = 0;
        let c = a;
        while (c != b) {
            const d = c;
            c = line.particles[c].next;
            right += euclideanDist(c, d);
            if (display && c != b) drawPt(c, 'orange', 'purple');
        }
        
        // walk distance, left
        let left = 0;
        c = a;
        while (c != b) {
            const d = c;
            c = line.particles[c].previous;
            left += euclideanDist(c, d);
            if (display && c != b) drawPt(c, 'turquoise', 'blue');
        }
        
        if (display) {
            // highlight the points on the svg renderer
            drawPt(a, 'lightgreen', 'green');
            drawPt(b, 'pink', 'red');
        }
        
        return {
            euclidean: euclidean,
            geodesic: Math.min(left, right)
        };
    }
    
    const samples = [];
    for (let sample = 0; sample < numSamples; ++sample) {
        
        // select 2 distinct points
        const a = parseInt(Math.random() * line.particles.length);
        const b = parseInt(Math.random() * line.particles.length);
        
        // add to list of samples
        samples.push(distances(a, b));
    }
    
    // display with ChartJS
    const canvas = document.createElement('canvas');
    const container = document.createElement('div');
    div.append(container);
    container.style.width = window.innerWidth * 0.4 + 'px';
    container.style.height = window.innerWidth * 0.2 + 'px';
    container.append(canvas);
    Chart.defaults.color = 'white';
    new Chart(canvas, {
        type: 'scatter',
        data: {
            labels: samples.map(a => a.euclidean),
            datasets: [{
                label: 'Geodesic distance vs euclidean distance',
                backgroundColor: 'white',
                data: samples.map(a => a.geodesic)
            }]
        },
        options: {}
    });
    
    // convert to csv to log to console
    let csv = samples.map(r => `${r.euclidean},${r.geodesic}`).join('\n');
    console.log(csv);
    
    // convert to python array of arrays (euclidean, geodesic)
    let py = `
# Raw auto-generated data points - array of ( euclidean, geodesic ) distance tuples
data = [${samples.map(r => `(${r.euclidean},${r.geodesic})`).join(',')}]
`;
    console.log(py);
}


export { sharedVertices, fractalDimension2D };
