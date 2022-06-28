import dedent from './util/dedent'

export default {
  htmlSource: '<div></div>',
  cssSource: dedent`
    /* STARTER TEMPLATE */
    div {
      width: 100px;
      height: 100px;
      background-color: red;
      position: absolute;
      animation:
        rotate 2s infinite,
        move-around 3s infinite alternate ease-out,
        change-color 2s infinite;
    }
    
    @keyframes move-around {
      0%  { top: 0px; left: 60%; }
      33%  { top: 30%; left: 60%; }
      66%  { top: 30%; left: 30%; }
      100%  { top: 0px; left: 30%; }
    }
    
    @keyframes rotate {
      0%  { transform: rotateZ(0deg); }
      20% { transform: rotateZ(360deg); }
    }
    
    @keyframes change-color {
      0%  { background-color: hotpink; }
      20% { background-color: purple; }
    }`,
}