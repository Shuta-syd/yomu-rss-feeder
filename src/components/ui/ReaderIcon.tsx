import type {SVGProps} from 'react';
const paths={
 search:'m21 21-4.4-4.4 M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0',
 filter:'M4 7h16M4 17h16M8 4v6M16 14v6',
 bookmark:'M6 3h12v18l-6-4-6 4V3Z',
 close:'m6 6 12 12M18 6 6 18',
 check:'m4 12 5 5L20 6',
 settings:'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
 refresh:'M20 7v5h-5M4 17v-5h5M5.5 7a7 7 0 0 1 11.6-2L20 8M4 16l2.9 3A7 7 0 0 0 18.5 17',
 logout:'M9 3H4v18h5M13 8l5 4-5 4M8 12h10',
 back:'m14 6-6 6 6 6',
 menu:'M4 6h16M4 12h16M4 18h16',
 moon:'M20.5 13A9 9 0 0 1 11 3.5 9 9 0 1 0 20.5 13Z',
 sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1',
};
export function ReaderIcon({name,...props}:{name:keyof typeof paths}&SVGProps<SVGSVGElement>){return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]}/></svg>;}
