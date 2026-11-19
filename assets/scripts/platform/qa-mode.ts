interface QaEnvironment {
    wx?:{getLaunchOptionsSync?:()=>{query?:Record<string,string>}};
    location?:Pick<Location,'hostname'|'search'>;
}

export function qaMode(debug:boolean,environment:QaEnvironment):string|null {
    if(environment.wx){
        if(!debug)return null;
        try{return environment.wx.getLaunchOptionsSync?.()?.query?.qa==='performance-long'?'performance-long':null;}
        catch{return null;}
    }
    const location=environment.location;
    return location&&['127.0.0.1','localhost'].includes(location.hostname)&&typeof URLSearchParams!=='undefined'?new URLSearchParams(location.search).get('qa'):null;
}
