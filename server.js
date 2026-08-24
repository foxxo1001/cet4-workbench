const http=require('http'),fs=require('fs'),path=require('path');
const root=__dirname;
const mime={'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]);
  if(p==='/')p='/index.html';
  const f=path.join(root,p);
  fs.readFile(f,(err,data)=>{
    if(err){res.writeHead(404);res.end('404');return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream'});
    res.end(data);
  });
}).listen(8765,()=>console.log('serving on 8765'));
