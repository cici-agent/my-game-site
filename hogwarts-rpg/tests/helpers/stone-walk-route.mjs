import { canOccupy, moveWithCollisions } from '../../chapter-one/client/scene-geometry.mjs';
import { PLAYER_RADIUS } from '../../chapter-one/movement.mjs';

// The online replay walks actual collision-valid routes. A hallway bend must not
// be bypassed by editing stored position just to make an economy test progress.
export function walkRoute(from, desired, navigation, floorAt = () => 0, tolerance = .8) {
  const [x0,x1,z0,z1]=navigation.bounds,walls=navigation.walls??[],margin=PLAYER_RADIUS+.02;
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),point=(x,z)=>({x,y:floorAt({x,z}),z});
  const inside=p=>p.x>=x0+margin&&p.x<=x1-margin&&p.z>=z0+margin&&p.z<=z1-margin;
  const clear=(a,b)=>distance(moveWithCollisions(a,b,navigation.bounds,walls),b)<.035;
  const goal=point(Math.max(x0+margin,Math.min(x1-margin,desired.x)),Math.max(z0+margin,Math.min(z1-margin,desired.z)));
  if(!canOccupy(goal,walls)) {
    let found=null;
    for(let radius=.2;radius<=Math.max(.22,tolerance);radius+=.15)for(let i=0;i<16;i++){
      const p=point(desired.x+Math.cos(i*Math.PI/8)*radius,desired.z+Math.sin(i*Math.PI/8)*radius);
      if(inside(p)&&canOccupy(p,walls)&&(!found||distance(from,p)<distance(from,found)))found=p;
    }
    if(!found)throw new Error(`No reachable interaction position ${JSON.stringify(desired)}`);
    Object.assign(goal,found);
  }
  if(clear(from,goal))return [goal];
  const step=.65,key=p=>`${Math.round((p.x-from.x)/step)}:${Math.round((p.z-from.z)/step)}`;
  const heap=[],push=node=>{heap.push(node);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].f<=node.f)break;heap[i]=heap[p];i=p;}heap[i]=node;};
  const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1].f<heap[child].f)child++;if(last.f<=heap[child].f)break;heap[i]=heap[child];i=child;}heap[i]=last;}return top;};
  const costs=new Map([[key(from),0]]),parents=new Map(),points=new Map([[key(from),point(from.x,from.z)]]);
  push({p:point(from.x,from.z),g:0,f:distance(from,goal)});
  for(let visits=0;heap.length&&visits<45000;visits++){
    const current=pop(),id=key(current.p);if(current.g>costs.get(id))continue;
    if(distance(current.p,goal)<step*1.6&&clear(current.p,goal)){
      const path=[goal];let cursor=id;while(cursor){path.unshift(points.get(cursor));cursor=parents.get(cursor);}
      const result=[];let index=0;while(index<path.length-1){let end=path.length-1;while(end>index+1&&!clear(path[index],path[end]))end--;result.push(path[end]);index=end;}return result;
    }
    for(const [dx,dz]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
      const next=point(current.p.x+dx*step,current.p.z+dz*step);if(!inside(next)||!canOccupy(next,walls)||!clear(current.p,next))continue;
      const g=current.g+Math.hypot(dx,dz)*step,nextId=key(next);if(g>=(costs.get(nextId)??Infinity))continue;
      costs.set(nextId,g);parents.set(nextId,id);points.set(nextId,next);push({p:next,g,f:g+distance(next,goal)});
    }
  }
  throw new Error(`No collision-valid route ${JSON.stringify(from)} -> ${JSON.stringify(desired)}`);
}
