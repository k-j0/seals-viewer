
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


export { sharedVertices };
