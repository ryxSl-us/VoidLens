/**
 * 
 * @param str 
 * @param type
 * 
 * Send logs to the console.  
 */


export async function log(str: string, type: 'info' | 'error' = 'info') {
    if (type === 'info') {
        console.log(`[INFO] ${str}`);
    }
    else if (type === 'error') {
        console.error(`[ERROR] ${str}`);
    }
    else {
        console.log(`[VOIDLENS] ${str}`);
    }
    
}