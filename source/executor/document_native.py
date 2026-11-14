"""Fixed child exec boundary for native PDF metadata/text tools, never a shell."""
import os
from pathlib import Path
import resource
import sys

LIMITS={'cpu_seconds':3,'wall_seconds':8,'memory_bytes':536870912,'memory_poll_milliseconds':100,'memory_enforcement':'parent_rss_kill_macos_hard_address_space_linux','file_bytes':2097152,'open_files':32,'output_bytes':65536}

def main():
    if len(sys.argv) not in (3,4):raise ValueError('Fixed native document arguments required')
    operation,binary=sys.argv[1:3]
    if operation not in ('info','text','info-version','text-version') or not Path(binary).is_absolute():raise ValueError('Fixed native document operation required')
    resource.setrlimit(resource.RLIMIT_CPU,(3,4))
    if sys.platform!='darwin':
        resource.setrlimit(resource.RLIMIT_DATA,(LIMITS['memory_bytes'],LIMITS['memory_bytes']))
        resource.setrlimit(resource.RLIMIT_AS,(LIMITS['memory_bytes'],LIMITS['memory_bytes']))
    resource.setrlimit(resource.RLIMIT_FSIZE,(LIMITS['file_bytes'],LIMITS['file_bytes']));resource.setrlimit(resource.RLIMIT_NOFILE,(32,32));resource.setrlimit(resource.RLIMIT_CORE,(0,0))
    if operation.endswith('-version'):
        if len(sys.argv)!=3:raise ValueError('No document for native version check')
        args=[binary,'-v']
    else:
        if len(sys.argv)!=4 or not Path(sys.argv[3]).is_absolute():raise ValueError('Protected native input file required')
        args=[binary,'-enc','UTF-8',sys.argv[3]] if operation=='info' else [binary,'-enc','UTF-8','-nopgbrk',sys.argv[3],'-']
    os.execve(binary,args,{'PATH':'/usr/bin:/bin','LANG':'C','LC_ALL':'C'})

if __name__=='__main__':main()
