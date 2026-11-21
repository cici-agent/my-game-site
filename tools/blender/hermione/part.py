"""Fibres sweep from a lengthwise off-centre part across each side of the ellipsoid."""
import numpy as np

def line_at(a):
    c=np.cos(a)
    return 1.70-.69*np.maximum(0,c)**2+.31*np.maximum(0,-c)+.026*np.sin(4*a)+.016*np.sin(9*a+.24)*np.maximum(c,0)**1.4-.036*np.exp(-((a+.14)/.25)**2)

def crown_direction(a,t):
    theta=t*line_at(a)
    return np.sin(a)*np.sin(theta),np.cos(theta),np.cos(a)*np.sin(theta)

def flow_phase(a,t):
    x,y,z=crown_direction(a,t)
    d=np.arcsin(np.clip(x+.042,-.999,.999))
    b=np.arctan2(z,y)
    phase=b+.22*(1-np.cos(1.8*d))+.035*np.sin(2.3*b+4.5*abs(d))+.013*np.sin(6*b-2*d)
    return phase,d

def fibre_path(beta,d,side):
    u=abs(d)
    angle=beta-.22*(1-np.cos(1.8*d))-.035*np.sin(2.3*beta+4.5*u)-.013*np.sin(6*beta-2*d)
    # Crossing the sagittal line slightly behind the forehead keeps the mass asymmetrical.
    x=np.clip(np.sin(d)-.042,-.9999,.9999)
    norm=np.sqrt(1-x*x)
    y=norm*np.cos(angle);z=norm*np.sin(angle)
    aa=np.arctan2(x,z);tt=np.arccos(np.clip(y,-1,1))/line_at(aa)
    return aa,tt
