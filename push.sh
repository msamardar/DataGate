#!/usr/bin/env bash
if [ "$1" != "" ]; then
	git add -A
	git commit -m "$1"
	git push origin HEAD
else
	echo "message is required for commit and push";

fi