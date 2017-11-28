import csv
import curses


def main(stdscr):
    # Clear screen
    stdscr.clear()

    # Other code
    print("Running some program")


if __name__ == '__main__':
    curses.wrapper(main)
