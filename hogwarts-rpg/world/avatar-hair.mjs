import * as THREE from 'three';

function surface(rows,columns,point) {
  const positions=[],indices=[];
  for(let y=0;y<=rows;y++) for(let x=0;x<=columns;x++) {
    positions.push(...point(y/rows,x/columns).toArray());
    if(y && x) {
      const d=y*(columns+1)+x,a=d-columns-2,b=a+1,c=d-1;
      indices.push(a,b,c,b,d,c);
    }
  }
  const mesh=new THREE.BufferGeometry();
  mesh.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  mesh.setIndex(indices);mesh.computeVertexNormals();return mesh;
}
function cap(part,tint,style) {
  const geometry=surface(12,32,(v,u)=>{
    const angle=u*Math.PI*2, front=Math.cos(angle);
    const edge=(style==='hermione'?-.027:-.004)+.103*front+.026*front*front+.009*Math.sin(3*angle+.8);
    const polar=Math.acos((edge-.025)/.241)*v;
    return new THREE.Vector3(.189*Math.sin(polar)*Math.sin(angle),.025+.241*Math.cos(polar),.009-.181*Math.sin(polar)*front);
  });
  part.shape(geometry,tint,0,0,0);
}
// A tapered ribbon with an elliptical section follows each individually drawn hair lock.
function lock(part,color,points,width,thickness,outward=[0,0,-1]) {
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal');
  const normal=new THREE.Vector3(...outward).normalize();
  const geometry=surface(12,8,(t,u)=>{
    const center=curve.getPoint(t),tangent=curve.getTangent(t);
    const across=new THREE.Vector3().crossVectors(tangent,normal).normalize();
    const outer=new THREE.Vector3().crossVectors(across,tangent).normalize();
    const phase=-Math.PI*2*u;
    const swell=.025+.975*Math.pow(Math.sin(Math.PI*Math.pow(t,.79)),.78);
    return center.addScaledVector(across,Math.cos(phase)*width*swell).addScaledVector(outer,Math.sin(phase)*thickness*swell);
  });
  part.shape(geometry,color,0,0,0);
}
const fringes={
  base:[
    [[.093,.239,-.062],[.055,.207,-.116],[-.046,.163,-.146],[-.141,.084,-.112]],
    [[.084,.229,-.084],[.043,.172,-.145],[-.021,.146,-.154],[-.075,.115,-.154]],
    [[.088,.233,-.056],[.136,.192,-.091],[.167,.124,-.085],[.174,.075,-.072]]
  ],
  harry:[
    [[.031,.241,-.075],[-.039,.202,-.128],[-.068,.149,-.151],[-.101,.096,-.149]],
    [[-.045,.228,-.083],[-.108,.191,-.111],[-.148,.151,-.103],[-.175,.093,-.093]],
    [[-.021,.241,-.08],[.008,.198,-.137],[-.005,.159,-.156],[-.022,.109,-.173]],
    [[.051,.233,-.070],[.099,.199,-.113],[.130,.160,-.121],[.143,.103,-.119]],
    [[.076,.224,-.084],[.117,.172,-.12],[.143,.135,-.112],[.176,.077,-.092]]
  ],
  ron:[
    [[-.103,.222,-.055],[-.052,.231,-.102],[.052,.184,-.14],[.144,.101,-.109]],
    [[-.106,.216,-.077],[-.045,.191,-.133],[.032,.154,-.158],[.076,.112,-.15]],
    [[-.095,.225,-.063],[-.133,.179,-.108],[-.150,.126,-.109],[-.161,.084,-.09]]
  ],
  hermione:[
    [[.019,.244,-.069],[.057,.207,-.124],[.115,.171,-.136],[.169,.079,-.11]],
    [[-.002,.248,-.061],[-.044,.204,-.128],[-.123,.151,-.131],[-.158,.085,-.117]]
  ]
};
export function sculptHair(part,style,tint) {
  cap(part,tint,style);
  const highlights={base:0x5c4235,harry:0x30292a,ron:0xc16a36,hermione:0x704a36};
  const light=highlights[style];
  fringes[style].forEach((points,i)=>lock(part,i%2?tint:light,points,style==='harry'?.037:.047,.021));
  if(style==='hermione') {
    for(let i=0;i<12;i++) {
      const a=.91+i*(Math.PI*2-1.82)/11, sx=Math.sin(a),cz=-Math.cos(a);
      const phase=i*.91, bottom=-.221+.042*Math.sin(phase*2);
      const strand=[[.136,.147],[.172,.092],[.199,.028],[.203,-.041],[.192,-.109],[.188,-.164],[.172,bottom]].map(([r,y],j)=>{
        const turn=a+Math.sin(j*1.43+phase)*.145;
        return [r*Math.sin(turn),y,-r*Math.cos(turn)+.012];
      });
      lock(part,i%3===1?light:tint,strand,.055,.030,[sx,0,cz]);
    }
    // The front locks curl across the silhouette, giving the waves depth even head-on.
    for(const side of [-1,1]) {
      const handed=(points,shorter=0)=>points.map(([x,y,z],i)=>[side*x,y+(side===1?shorter*i/(points.length-1):0),z]);
      lock(part,tint,handed([[.127,.162,-.059],[.181,.124,-.069],[.211,.054,-.078],[.184,-.007,-.096],
        [.198,-.064,-.103],[.237,-.115,-.092],[.249,-.18,-.073],[.207,-.244,-.082],[.226,-.301,-.072]],.019),.046,.031,[side*.4,0,-1]);
      lock(part,0x7c533c,handed([[.157,.149,-.047],[.198,.104,-.072],[.201,.04,-.104],[.171,-.016,-.117],
        [.175,-.065,-.120],[.212,-.114,-.116],[.216,-.165,-.110],[.180,-.209,-.12],[.181,-.254,-.107]],.016),.031,.024,[side*.28,0,-1]);
      lock(part,0x66422f,handed([[.155,.08,.025],[.205,.038,.006],[.223,-.015,.0],[.207,-.079,.012],
        [.226,-.116,.004],[.257,-.156,.007],[.25,-.213,.008],[.259,-.253,.020]],.026),.035,.027,[side,0,-.45]);
    }
  } else {
    for(const side of [-1,1]) {
      lock(part,tint,[[side*.139,.161,-.043],[side*.169,.132,-.066],[side*.178,.07,-.076],[side*.168,.01,-.061]],.043,.019,[side,0,-.5]);
    }
    if(style==='harry') {
      lock(part,light,[[-.074,.218,.07],[-.029,.247,.050],[.035,.262,.040],[.096,.253,.030],[.144,.233,.014]],.031,.017,[0,.4,1]);
      lock(part,tint,[[-.108,.186,.056],[-.146,.172,.044],[-.176,.142,.031],[-.203,.133,.017]],.027,.015,[-1,0,.3]);
    }
  }
}
