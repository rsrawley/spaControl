#!/bin/bash

# Function definition
push_updates () {
        git add . # add all files to be tracked
        git commit -a # commit all changes
        git push origin master # master branch
}

#cd libraries
#push_updates # submodule update

#cd ..
push_updates # main repo update

