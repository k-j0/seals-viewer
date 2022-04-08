
import * as THREE from 'https://cdn.skypack.dev/three@0.133.1';


function aboveZero (x) { return x > 0 ? 1 : 0; }

function invLerp (x, a, b) { return (x - a) / (b - a); }

/// Intersection point of line {a,b} and the XY plane
function linePlaneIntersection (a, b) {
    const dir = b.clone().sub(a).normalize();
    
    if (dir.z == 0) {
        return null;
    }
    
    const t = -a.z / dir.z;
    const result = a.clone().add(dir.multiplyScalar(t));
    console.assert(Math.abs(result.z) <= 10e-7, result.z);
    return [result.x, result.y];
}

export function CrossSection (originalGeo, position, rotation) {
    
    if (!Array.isArray(position)) {
        position = [position.x, position.y, position.z];
    }
    
    // Clone & reorient geometry
    const geo = originalGeo.clone();
    geo.translate(-position[0], -position[1], -position[2]);
    geo.rotateX(-rotation[0]);
    geo.rotateY(-rotation[1]);
    geo.rotateZ(-rotation[2]);
    
    // Find all triangle intersections in the XY plane
    const vertices = geo.getAttribute('position').array;
    let indices = new Array(vertices.length / 3); for (let i = 0; i < vertices.length / 3; ++i) indices[i] = i;
    if (geo.getIndex()) indices = geo.getIndex().array;
    const paths = [];
    for (let i = 0; i < indices.length; i += 3) {
        const a = new THREE.Vector3(vertices[indices[i] * 3], vertices[indices[i] * 3 + 1], vertices[indices[i] * 3 + 2]);
        const b = new THREE.Vector3(vertices[indices[i+1] * 3], vertices[indices[i+1] * 3 + 1], vertices[indices[i+1] * 3 + 2]);
        const c = new THREE.Vector3(vertices[indices[i+2] * 3], vertices[indices[i+2] * 3 + 1], vertices[indices[i+2] * 3 + 2]);
        
        const above = aboveZero(a.z) + aboveZero(b.z) + aboveZero(c.z);
        if (above > 0 && above < 3) {
            // at least one point lies above and one below 0 along Z
            
            // separate into one odd point and 2 even points
            let oddIdx;
            if (above > 1) { // 2 points above, 1 below
                oddIdx = a.z <= 0 ? 0 : b.z <= 0 ? 1 : 2;
            } else {
                oddIdx = a.z > 0 ? 0 : b.z > 0 ? 1 : 2;
            }
            const odd = [a, b, c][oddIdx];
            const even = [a, b, c].filter((_, i) => i != oddIdx);
            
            // find intersection points between { odd, even[i] } and the plane
            const d = linePlaneIntersection(even[0], odd);
            const e = linePlaneIntersection(even[1], odd);
            
            if (d === null || e === null) {
                console.warn('Line was in plane:', odd, even);
            } else {
                paths.push([ d, e ]);
            }
            
        }
    }
    
    // normalize to 0..1
    let minX = Number.POSITIVE_INFINITY, minY = Number.POSITIVE_INFINITY, maxX = Number.NEGATIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
    for (const path of paths) {
        for (const p of path) {
            const x = p[0];
            const y = p[1];
            if (minX > x) minX = x;
            if (minY > y) minY = y;
            if (maxX < x) maxX = x;
            if (maxY < y) maxY = y;
        }
    }
    for (let i = 0; i < paths.length; ++i) {
        for (let j = 0; j < paths[i].length; ++j) {
            const x = paths[i][j][0];
            const y = paths[i][j][1];
            paths[i][j] = [
                invLerp(x, minX, maxX),
                invLerp(y, minY, maxY)
            ];
        }
    }
    const aspectRatio = (maxX - minX) / (maxY - minY);
    
    // Create in-place svg
    let svg = '';
    for (const path of paths) {
        svg += 'M ';
        let first = true;
        for (const p of path) {
            if (first) {
                first = false;
            } else {
                svg += 'L ';
            }
            let x = -p[0] + 0.5;
            let y = -p[1] + 0.5;
            if (aspectRatio > 1) {
                y /= aspectRatio;
            } else {
                x *= aspectRatio;
            }
            x += 0.5; y += 0.5;
            x = Math.round(x * 512);
            y = Math.round(y * 512);
            svg += x + ' ' + y + ' ';
        }
    }
    return `<svg
        width="512"
        height="512"
        viewBox="0 0 512 512"
        xmlns="http://www.w3.org/2000/svg">
            <path d="${svg}" stroke="black" stroke-width="1"/>
        </svg>`;
}
